import type { Request, Response } from 'express';
import { query, withTransaction } from '../config/db.js';
import { getPagination, paginated } from '../utils/pagination.js';

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// POST /orders  { userId, items: [{ productId, quantity }] }
// Creates the order, checks/decrements stock and writes line items in one
// transaction, so a failure on any item rolls the whole thing back.
export async function placeOrder(req: Request, res: Response) {
  const { userId, items } = req.body ?? {};

  if (!userId || !Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ error: 'userId and a non-empty items[] are required' });
  }
  for (const it of items) {
    if (!it.productId || !Number.isInteger(it.quantity) || it.quantity <= 0) {
      return res.status(400).json({
        error: 'each item needs a productId and a positive integer quantity',
      });
    }
  }

  try {
    const result = await withTransaction(async (client) => {
      const {
        rows: [order],
      } = await client.query(
        `INSERT INTO orders (user_id, status) VALUES ($1, 'pending')
         RETURNING id, user_id, status, created_at`,
        [userId],
      );

      const lineItems = [];
      for (const it of items) {
        // Lock the product row so concurrent orders can't oversell it.
        const {
          rows: [product],
        } = await client.query(
          'SELECT id, price_cents, stock FROM products WHERE id = $1 FOR UPDATE',
          [it.productId],
        );

        if (!product) {
          throw new HttpError(404, `product ${it.productId} does not exist`);
        }
        if (product.stock < it.quantity) {
          throw new HttpError(
            409,
            `not enough stock for product ${it.productId} (have ${product.stock}, want ${it.quantity})`,
          );
        }

        await client.query(
          'UPDATE products SET stock = stock - $1 WHERE id = $2',
          [it.quantity, it.productId],
        );
        const {
          rows: [li],
        } = await client.query(
          `INSERT INTO line_items (order_id, product_id, quantity, unit_price_cents)
           VALUES ($1, $2, $3, $4)
           RETURNING id, product_id, quantity, unit_price_cents`,
          [order.id, it.productId, it.quantity, product.price_cents],
        );
        lineItems.push(li);
      }

      await client.query("UPDATE orders SET status = 'paid' WHERE id = $1", [
        order.id,
      ]);
      return { ...order, status: 'paid', line_items: lineItems };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    if ((err as { code?: string })?.code === '23503') {
      return res
        .status(400)
        .json({ error: 'userId does not reference a real user' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to place order' });
  }
}

// GET /orders/:id  — order with its user and line items.
export async function getOrderById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const { rows: headerRows } = await query(
      `SELECT o.id, o.status, o.created_at,
              u.id AS user_id, u.name AS user_name, u.email AS user_email
         FROM orders o
         JOIN users u ON u.id = o.user_id
        WHERE o.id = $1`,
      [id],
    );
    if (headerRows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const h = headerRows[0];

    const { rows: items } = await query(
      `SELECT li.product_id, p.name AS product_name, li.quantity,
              li.unit_price_cents,
              (li.quantity * li.unit_price_cents) AS line_total_cents
         FROM line_items li
         JOIN products p ON p.id = li.product_id
        WHERE li.order_id = $1
        ORDER BY li.id`,
      [id],
    );

    res.json({
      id: h.id,
      status: h.status,
      created_at: h.created_at,
      user: { id: h.user_id, name: h.user_name, email: h.user_email },
      line_items: items,
      total_cents: items.reduce((s, r) => s + Number(r.line_total_cents), 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
}

// GET /orders?userId=&page=&limit=
export async function listOrders(req: Request, res: Response) {
  try {
    const p = getPagination(req);
    const { userId } = req.query;
    const hasUser = typeof userId === 'string';
    const where = hasUser ? 'WHERE o.user_id = $1' : '';
    const filterParams = hasUser ? [userId] : [];
    const n = filterParams.length;

    const { rows } = await query(
      `SELECT o.id, o.user_id, o.status, o.created_at,
              COUNT(li.id) AS item_count,
              COALESCE(SUM(li.quantity * li.unit_price_cents), 0) AS total_cents
         FROM orders o
         LEFT JOIN line_items li ON li.order_id = o.id
         ${where}
        GROUP BY o.id
        ORDER BY o.id
        LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...filterParams, p.limit, p.offset],
    );
    const {
      rows: [{ count }],
    } = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM orders o ${where}`,
      filterParams,
    );

    res.json(paginated(rows, count, p));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list orders' });
  }
}

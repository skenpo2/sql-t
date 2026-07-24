import type { Request, Response } from 'express';
import { query } from '../config/db.js';
import { getPagination, paginated } from '../utils/pagination.js';

interface Product {
  id: number;
  name: string;
  price_cents: number;
  stock: number;
  attributes: Record<string, unknown>;
  created_at: string;
}

// GET /products?page=&limit=&color=&size=&material=
// The attribute filters use JSONB containment (attributes @> $1).
export async function getProducts(req: Request, res: Response) {
  try {
    const p = getPagination(req);

    const filter: Record<string, string> = {};
    for (const key of ['color', 'size', 'material']) {
      const val = req.query[key];
      if (typeof val === 'string') filter[key] = val;
    }
    const hasFilter = Object.keys(filter).length > 0;
    const where = hasFilter ? 'WHERE attributes @> $1' : '';
    const filterParams = hasFilter ? [JSON.stringify(filter)] : [];
    const n = filterParams.length;

    const { rows } = await query<Product>(
      `SELECT id, name, price_cents, stock, attributes, created_at
         FROM products ${where}
        ORDER BY id
        LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...filterParams, p.limit, p.offset],
    );
    const {
      rows: [{ count }],
    } = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM products ${where}`,
      filterParams,
    );

    res.json(paginated(rows, count, p));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
}

// GET /products/:id
export async function getProductById(req: Request, res: Response) {
  try {
    const { rows } = await query<Product>(
      `SELECT id, name, price_cents, stock, attributes, created_at
         FROM products WHERE id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
}

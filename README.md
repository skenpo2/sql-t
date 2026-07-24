# express-postgres-crud

Express + PostgreSQL REST API in TypeScript using the `pg` driver (no ORM).

## Data model

```
users ──1:1── user_profiles
  │ 1:N
  ▼
orders ──∞──< line_items >──∞── products
```

See [sql/schema.sql](sql/schema.sql) for keys, constraints, and indexes.

## Setup

```bash
npm install
createdb morbyte            # must match DATABASE_URL in .env
npm run db:setup            # runs sql/schema.sql (drops, recreates, seeds)
npm run dev                 # http://localhost:3000
```

## API

All list endpoints are paginated via `?page` (default 1) and `?limit`
(default 20, max 100), and respond with:

```json
{ "data": [ ... ], "pagination": { "page": 1, "limit": 20, "total": 34, "totalPages": 2 } }
```

### Users
| Method | Path | Notes |
|---|---|---|
| GET | `/users` | paginated |
| GET | `/users/:id` | |
| POST | `/users` | `{ name, email }` |
| PUT | `/users/:id` | `{ name, email }` |
| DELETE | `/users/:id` | |

### Products
| Method | Path | Notes |
|---|---|---|
| GET | `/products` | paginated; filter by `?color`, `?size`, `?material` (JSONB) |
| GET | `/products/:id` | |

### Orders
| Method | Path | Notes |
|---|---|---|
| GET | `/orders` | paginated; filter by `?userId` |
| GET | `/orders/:id` | order with user + line items + total |
| POST | `/orders` | `{ userId, items: [{ productId, quantity }] }` — transactional |

## Examples

```bash
curl 'localhost:3000/products?page=2&limit=10'
curl 'localhost:3000/products?color=red'
curl 'localhost:3000/orders?userId=1'
curl localhost:3000/orders/1

curl -X POST localhost:3000/orders -H 'Content-Type: application/json' \
  -d '{"userId":1,"items":[{"productId":2,"quantity":1}]}'
```

`POST /orders` runs as a single transaction: it locks each product row,
checks and decrements stock, and writes line items. If any item fails
(e.g. insufficient stock) the whole order rolls back.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | run with tsx watch (auto-reload) |
| `npm run build` | compile to `dist/` |
| `npm start` | run compiled output |
| `npm run db:setup` | apply `sql/schema.sql` |

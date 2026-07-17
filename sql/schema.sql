-- Run with:  psql "$DATABASE_URL" -f sql/schema.sql
-- or:        npm run db:setup

CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(255) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- A couple of seed rows so GET /users returns something immediately.
INSERT INTO users (name, email) VALUES
    ('Ada Lovelace',   'ada@example.com'),
    ('Alan Turing',    'alan@example.com')
ON CONFLICT (email) DO NOTHING;

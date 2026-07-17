import type { Request, Response } from 'express';
import { query } from '../config/db.js';

interface User {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export async function getUsers(_req: Request, res: Response) {
  try {
    const { rows } = await query<User>(
      'SELECT id, name, email, created_at FROM users ORDER BY id',
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

export async function getUserById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { rows } = await query<User>(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}

// POST /users  — create a user
export async function createUser(req: Request, res: Response) {
  try {
    const { name, email } = req.body ?? {};

    if (!name || !email) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    // RETURNING gives us the newly-created row (including the generated id).
    const { rows } = await query<User>(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email, created_at',
      [name, email],
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    // 23505 = unique_violation (duplicate email)
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
}

// PUT /users/:id  — update a user
export async function updateUser(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, email } = req.body ?? {};

    if (!name || !email) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    const { rows } = await query<User>(
      'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email, created_at',
      [name, email, id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update user' });
  }
}

// DELETE /users/:id  — remove a user
export async function deleteUser(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { rowCount } = await query('DELETE FROM users WHERE id = $1', [id]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
}

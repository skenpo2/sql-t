import express from 'express';
import dotenv from 'dotenv';
import usersRouter from './routes/users.js';
import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';
import { pool } from './config/db.js';

dotenv.config();

const app = express();

// Parse JSON request bodies into req.body
app.use(express.json());

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Feature routers
app.use('/users', usersRouter);
app.use('/products', productsRouter);
app.use('/orders', ordersRouter);

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

// Close the DB pool cleanly on shutdown (Ctrl+C).
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await pool.end();
  server.close(() => process.exit(0));
});

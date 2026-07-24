import { Router } from 'express';
import {
  placeOrder,
  getOrderById,
  listOrders,
} from '../controllers/orders.controller.js';

const router = Router();

router.get('/', listOrders); // GET /orders?userId=1
router.get('/:id', getOrderById); // GET /orders/1  (JOINs)
router.post('/', placeOrder); // POST /orders   (transaction)

export default router;

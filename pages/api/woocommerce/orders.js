import axios from 'axios';
import pool from '../../../lib/db';

export default async function handler(req, res) {
  const orderPayload = req.body;
  const authHeader = 'Basic ' + Buffer.from(`${process.env.WOO_CONSUMER_KEY}:${process.env.WOO_CONSUMER_SECRET}`).toString('base64');

  try {
    // Probeer WooCommerce
    const response = await axios.post(`${process.env.WOO_URL}/wp-json/wc/v3/orders`, orderPayload, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      timeout: 8000
    });
    return res.status(200).json({ success: true, orderId: response.data.id });
  } catch (error) {
    // Fallback naar MariaDB
    const [result] = await pool.query('INSERT INTO pos_orders (order_data) VALUES (?)', [JSON.stringify(orderPayload)]);
    return res.status(200).json({ success: true, offline: true, orderId: `LOCAL-${result.insertId}` });
  }
}
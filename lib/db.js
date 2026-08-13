// lib/db.js
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  user: 'root',
  database: 'bendemen_pos',
  socketPath: '/run/mysqld/mysqld.sock',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export async function initDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pos_stores (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        sumup_reader_id VARCHAR(255) DEFAULT NULL
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS pos_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        status VARCHAR(50) DEFAULT 'pending_sync',
        is_synced TINYINT(1) DEFAULT 0,
        order_data JSON,
        offline_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await connection.query(`
      INSERT INTO pos_stores (id, name, location) 
      VALUES ('store_ons_winkeltje', 'Ons Winkeltje', 'Hellevoetsluis')
      ON DUPLICATE KEY UPDATE location = VALUES(location);
    `);
  } finally {
    connection.release();
  }
}

export async function saveOfflineOrder(orderData) {
  const [result] = await pool.query(
    'INSERT INTO pos_orders (status, is_synced, order_data) VALUES (?, ?, ?)',
    ['pending_sync', 0, JSON.stringify(orderData)]
  );
  return result.insertId;
}

export default pool;
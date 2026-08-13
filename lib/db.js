// lib/db.js
import mysql from 'mysql2/promise';

// 1. Maak de verbinding pool aan met MariaDB op de server
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'bendemen',
  password: process.env.DB_PASSWORD || 'Ben#de!men18',
  database: process.env.DB_NAME || 'bendemen_pos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 2. Hulp-functie om automatisch tabellen aan te maken bij het starten
export async function initDatabase() {
  const connection = await pool.getConnection();
  try {
    // Tabel voor winkels (store management) met sumup ondersteuning
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pos_stores (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        sumup_reader_id VARCHAR(255) DEFAULT NULL
      );
    `);

    // Tabel voor orders / transacties
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pos_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        status VARCHAR(50) DEFAULT 'pending_sync',
        is_synced TINYINT(1) DEFAULT 0,
        order_data JSON,
        offline_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Zorg dat de hoofdwinkel netjes op Hellevoetsluis staat ingesteld
    await connection.query(`
      INSERT INTO pos_stores (id, name, location) 
      VALUES ('store_ons_winkeltje', 'Ons Winkeltje', 'Hellevoetsluis')
      ON DUPLICATE KEY UPDATE location = VALUES(location);
    `);
  } finally {
    connection.release();
  }
}

// 3. Server-equivalent van saveOfflineOrder
export async function saveOfflineOrder(orderData) {
  const [result] = await pool.query(
    'INSERT INTO pos_orders (status, is_synced, order_data) VALUES (?, ?, ?)',
    ['pending_sync', 0, JSON.stringify(orderData)]
  );
  return result.insertId;
}

export default pool;
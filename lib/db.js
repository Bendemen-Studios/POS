import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  user: 'root',
  database: 'bendemen_pos',
  socketPath: '/run/mysqld/mysqld.sock',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * Initialiseert de database schema's en standaard data
 */
export async function initDatabase() {
  const connection = await pool.getConnection();
  try {
    // Tabel voor winkellocaties en SumUp koppelingen
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pos_stores (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        sumup_reader_id VARCHAR(255) DEFAULT NULL
      );
    `);

    // Tabel voor offline bestellingen (pending sync)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pos_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        status VARCHAR(50) DEFAULT 'pending_sync',
        is_synced TINYINT(1) DEFAULT 0,
        order_data JSON,
        offline_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Zorg dat de basiswinkel altijd aanwezig is
    await connection.query(`
      INSERT INTO pos_stores (id, name, location) 
      VALUES ('store_ons_winkeltje', 'Ons Winkeltje', 'Hellevoetsluis')
      ON DUPLICATE KEY UPDATE location = VALUES(location);
    `);
  } finally {
    connection.release();
  }
}

// --- CRUD FUNCTIES ---

/**
 * Slaat een bestelling op voor offline verwerking
 */
export async function saveOfflineOrder(orderData) {
  const [result] = await pool.query(
    'INSERT INTO pos_orders (status, is_synced, order_data) VALUES (?, ?, ?)',
    ['pending_sync', 0, JSON.stringify(orderData)]
  );
  return result.insertId;
}

/**
 * Haalt alle opgeslagen winkels op
 */
export async function getStores() {
  const [rows] = await pool.query('SELECT * FROM pos_stores');
  return rows;
}

/**
 * Haalt alle orders op die nog niet naar WooCommerce zijn verstuurd
 */
export async function getPendingOrders() {
  const [rows] = await pool.query('SELECT * FROM pos_orders WHERE is_synced = 0');
  return rows;
}

/**
 * Markeert een order als succesvol gesynchroniseerd
 */
export async function markOrderAsSynced(orderId) {
  await pool.query('UPDATE pos_orders SET status = ?, is_synced = ? WHERE id = ?', ['synced', 1, orderId]);
}

// Initialiseer direct bij het laden van het bestand
initDatabase().catch(err => console.error('Database initialisatie mislukt:', err));

export default pool;
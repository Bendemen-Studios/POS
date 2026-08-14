import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

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
    // Winkels tabel
    await connection.query(`CREATE TABLE IF NOT EXISTS pos_stores (id VARCHAR(50) PRIMARY KEY, name VARCHAR(255), location VARCHAR(255), sumup_reader_id VARCHAR(255));`);
    
    // Gebruikers tabel met 'cashier' als standaard rol
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pos_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'cashier',
        name VARCHAR(255)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Orders tabel (Offline opslag)
    await connection.query(`CREATE TABLE IF NOT EXISTS pos_orders (id INT AUTO_INCREMENT PRIMARY KEY, status VARCHAR(50) DEFAULT 'pending_sync', is_synced TINYINT(1) DEFAULT 0, order_data JSON, offline_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);

    // Standaard winkel toevoegen
    await connection.query(`INSERT IGNORE INTO pos_stores (id, name, location) VALUES ('store_ons_winkeltje', 'Ons Winkeltje', 'Hellevoetsluis');`);

    // Hash het wachtwoord voor de super administrator 'bendemen'
    const superAdminHash = await bcrypt.hash('Ben#de!men18', 10);

    // Zorg dat de vaste super administrator 'bendemen' altijd bestaat
    await connection.query(`
      INSERT INTO pos_users (username, password_hash, name, role) 
      VALUES ('bendemen', ?, 'Bendemen Super Admin', 'administrator')
      ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);
    `, [superAdminHash]);

  } finally {
    connection.release();
  }
}

initDatabase().catch(console.error);
export default pool;
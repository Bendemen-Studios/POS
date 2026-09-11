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
    // The active POS APIs use the legacy `stores` and `users` tables.
    // Keep the newer pos_* tables for backwards compatibility, but make
    // sure the tables actually queried by the API always exist.
    await connection.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id VARCHAR(50) PRIMARY KEY,
        store_name VARCHAR(255) NOT NULL,
        address VARCHAR(255) DEFAULT NULL,
        pickup_id VARCHAR(255) DEFAULT NULL,
        terminal_id VARCHAR(255) DEFAULT NULL,
        sumup_reader_id VARCHAR(255) DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) DEFAULT NULL,
        password VARCHAR(255) DEFAULT NULL,
        password_hash VARCHAR(255) DEFAULT NULL,
        role VARCHAR(50) DEFAULT 'cashier',
        store_id VARCHAR(255) DEFAULT NULL,
        name VARCHAR(255) DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Original local POS tables are kept for compatibility with existing data.
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pos_stores (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255),
        location VARCHAR(255),
        sumup_reader_id VARCHAR(255)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS pos_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'cashier',
        name VARCHAR(255)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS pos_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        status VARCHAR(50) DEFAULT 'pending_sync',
        is_synced TINYINT(1) DEFAULT 0,
        order_data JSON,
        offline_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Default store used by the POS.
    await connection.query(`
      INSERT IGNORE INTO stores (id, store_name, address)
      VALUES ('store_ons_winkeltje', 'Ons Winkeltje', 'Hellevoetsluis');
    `);

    await connection.query(`
      INSERT IGNORE INTO pos_stores (id, name, location)
      VALUES ('store_ons_winkeltje', 'Ons Winkeltje', 'Hellevoetsluis');
    `);

    // Migrate users from the newer pos_users schema into the schema used by
    // the active APIs, without overwriting existing accounts.
    await connection.query(`
      INSERT INTO users (username, password_hash, role, name)
      SELECT p.username, p.password_hash, p.role, p.name
      FROM pos_users p
      LEFT JOIN users u ON u.username = p.username
      WHERE u.id IS NULL;
    `);

    // If an administrator password is explicitly configured in the VPS
    // environment, ensure the main administrator exists. Never overwrite an
    // existing password on every server start.
    const adminPassword = process.env.POS_SUPER_ADMIN_PASSWORD;
    if (adminPassword) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await connection.query(`
        INSERT INTO users (username, password, password_hash, name, role)
        VALUES ('bendemen', ?, ?, 'Bendemen Super Admin', 'administrator')
        ON DUPLICATE KEY UPDATE
          password_hash = COALESCE(NULLIF(password_hash, ''), VALUES(password_hash)),
          password = COALESCE(NULLIF(password, ''), VALUES(password)),
          name = VALUES(name),
          role = VALUES(role);
      `, [hash, hash]);

      await connection.query(`
        INSERT INTO pos_users (username, password_hash, name, role)
        VALUES ('bendemen', ?, 'Bendemen Super Admin', 'administrator')
        ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);
      `, [hash]);
    }
  } finally {
    connection.release();
  }
}

initDatabase().catch(console.error);
export default pool;

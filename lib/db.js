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
    // The active POS APIs use the `stores` and `users` tables.
    // Create the schemas when they do not exist, but NEVER seed a default
    // store: the admin/database is the single source of truth for branches.
    await connection.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id VARCHAR(50) PRIMARY KEY,
        store_name VARCHAR(255) NOT NULL,
        address VARCHAR(255) DEFAULT NULL,
        receipt_header TEXT DEFAULT NULL,
        receipt_footer TEXT DEFAULT NULL,
        pickup_id VARCHAR(255) DEFAULT NULL,
        terminal_id VARCHAR(255) DEFAULT NULL,
        kvk VARCHAR(255) DEFAULT NULL,
        btw VARCHAR(255) DEFAULT NULL,
        payment_methods JSON DEFAULT NULL
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

    // Existing databases may have an older `stores` schema. Add the columns
    // used by the current admin/store API without replacing existing data.
    const storeColumns = [
      ['receipt_header', 'TEXT DEFAULT NULL'],
      ['receipt_footer', 'TEXT DEFAULT NULL'],
      ['pickup_id', 'VARCHAR(255) DEFAULT NULL'],
      ['terminal_id', 'VARCHAR(255) DEFAULT NULL'],
      ['kvk', 'VARCHAR(255) DEFAULT NULL'],
      ['btw', 'VARCHAR(255) DEFAULT NULL'],
      ['payment_methods', 'JSON DEFAULT NULL']
    ];
    for (const [column, definition] of storeColumns) {
      try {
        await connection.query(`ALTER TABLE stores ADD COLUMN ${column} ${definition}`);
      } catch (_) {
        // Column already exists.
      }
    }

    // Existing databases may have a numeric store_id. Keep it compatible
    // with the string store IDs used by the POS.
    try {
      await connection.query('ALTER TABLE users MODIFY COLUMN store_id VARCHAR(255) DEFAULT NULL');
    } catch (_) {}

    // Original local POS tables are kept for backwards compatibility.
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

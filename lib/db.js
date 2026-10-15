import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = Number.parseInt(process.env.DB_PORT || '', 10);
const dbSocketPath = process.env.DB_SOCKET_PATH || (
  !process.env.DB_PORT && ['localhost', '127.0.0.1'].includes(dbHost)
    ? '/run/mysqld/mysqld.sock'
    : undefined
);

const pool = mysql.createPool({
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || undefined,
  database: process.env.DB_NAME || 'bendemen_pos',
  ...(dbSocketPath ? { socketPath: dbSocketPath } : { host: dbHost, port: Number.isInteger(dbPort) && dbPort > 0 ? dbPort : 3306 }),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export async function initDatabase() {
  const connection = await pool.getConnection();
  try {
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
      try { await connection.query(`ALTER TABLE stores ADD COLUMN ${column} ${definition}`); } catch (_) {}
    }

    const userColumns = [
      ['email', 'VARCHAR(255) DEFAULT NULL'],
      ['password', 'VARCHAR(255) DEFAULT NULL'],
      ['password_hash', 'VARCHAR(255) DEFAULT NULL'],
      ['role', "VARCHAR(50) DEFAULT 'cashier'"],
      ['store_id', 'VARCHAR(255) DEFAULT NULL'],
      ['name', 'VARCHAR(255) DEFAULT NULL']
    ];
    for (const [column, definition] of userColumns) {
      try { await connection.query(`ALTER TABLE users ADD COLUMN ${column} ${definition}`); } catch (_) {}
    }

    try { await connection.query('ALTER TABLE users MODIFY COLUMN store_id VARCHAR(255) DEFAULT NULL'); } catch (_) {}

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

    // Migrate legacy pos_users accounts. Use the legacy `password` column as
    // the destination because production installations may have that column
    // mandatory and may not have password_hash at all. Login accepts bcrypt
    // hashes in password, so this works for both old and new schemas.
    await connection.query(`
      INSERT INTO users (username, password, role, name)
      SELECT p.username, p.password_hash, p.role, p.name
      FROM pos_users p
      LEFT JOIN users u ON u.username = p.username
      WHERE u.id IS NULL;
    `);

    const adminPassword = process.env.POS_SUPER_ADMIN_PASSWORD;
    if (adminPassword) {
      // Avoid running bcrypt and rewriting the legacy account on every cold
      // start. Hash the configured password only when no credential exists.
      const [existingAdminRows] = await connection.query(
        "SELECT password, password_hash FROM users WHERE username = 'bendemen' LIMIT 1"
      );
      const existingAdmin = existingAdminRows?.[0];
      const storedAdminCredential = existingAdmin?.password_hash || existingAdmin?.password;
      const hash = storedAdminCredential || await bcrypt.hash(adminPassword, 10);

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
        ON DUPLICATE KEY UPDATE password_hash = COALESCE(NULLIF(password_hash, ''), VALUES(password_hash));
      `, [hash]);
    }
  } finally {
    connection.release();
  }
}

let databaseReadyPromise = null;

// Retry initialization after a startup outage instead of keeping a permanently
// rejected promise when MySQL is unavailable during the first boot.
export function ensureDatabaseReady() {
  if (!databaseReadyPromise) {
    databaseReadyPromise = initDatabase().catch((error) => {
      databaseReadyPromise = null;
      throw error;
    });
  }
  return databaseReadyPromise;
}

export default pool;

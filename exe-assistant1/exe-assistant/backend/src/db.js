import mysql from "mysql2/promise";
const config = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
};
const DB_NAME = process.env.DB_NAME || "exe_assistant";
let pool;
export const all = async (sql, params = []) => (await pool.query(sql, params))[0];
export const one = async (sql, params = []) => (await all(sql, params))[0];
export const run = (sql, params = []) => pool.query(sql, params);
export async function initDb() {
  const setup = await mysql.createConnection(config);
  await setup.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4`);
  await setup.end();
  pool = mysql.createPool({ ...config, database: DB_NAME, charset: "utf8mb4", connectionLimit: 10 });
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    google_refresh_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4`);
  await run(`CREATE TABLE IF NOT EXISTS otps (
    email VARCHAR(255) PRIMARY KEY,
    code_hash CHAR(64) NOT NULL,
    expires_at BIGINT NOT NULL
  ) CHARACTER SET utf8mb4`);
  await run(`CREATE TABLE IF NOT EXISTS emails (
    id VARCHAR(64) PRIMARY KEY,             
    user_id INT NOT NULL,
    thread_id VARCHAR(64),
    message_id VARCHAR(512),                
    from_addr VARCHAR(512),
    subject VARCHAR(1000),
    body MEDIUMTEXT,
    summary TEXT,
    priority ENUM('high','mid','low') DEFAULT 'mid',
    replied TINYINT(1) DEFAULT 0,
    received_at BIGINT,
    INDEX idx_emails_user (user_id, received_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`);
  const tables = await all("SHOW TABLES");
  console.log("Tables:", tables.map((t) => Object.values(t)[0]).join(", "));
  console.log(`MySQL ready (database: ${DB_NAME})`);
} 
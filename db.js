// db.js
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: "localhost",
  user: "root",       // your MySQL username
  password: "2979", // your MySQL password
  database: "courier_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection once when server starts
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log("✅ MySQL Connected!");
    conn.release();
  } catch (err) {
    console.error("❌ MySQL Connection Failed:", err);
  }
})();

module.exports = pool;

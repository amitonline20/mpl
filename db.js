const oracledb = require("oracledb");
const dbConfig = require("./dbConfig"); // keep credentials separate

let pool;

// Initialize pool (call once at app start)
async function initPool() {
  if (!pool) {
    pool = await oracledb.createPool({
      user: dbConfig.user,
      password: dbConfig.password,
      connectString: dbConfig.connectString,
      poolMin: 1,
      poolMax: 5,
      poolIncrement: 1,
      poolTimeout: 60, // close idle after 60s
    });
    console.log("✅ Oracle connection pool started");
  }
}

// Get a connection from the pool
async function getConnection() {
  if (!pool) {
    await initPool();
  }
  return await pool.getConnection();
}

// Simple keepalive ping (optional)
async function keepAlive() {
  try {
    const conn = await getConnection();
    await conn.execute("SELECT 1 FROM dual");
    await conn.close();
    console.log("✅ Keepalive successful");
  } catch (err) {
    console.error("⚠️ Keepalive failed:", err.message);
  }
}

// Close pool gracefully (use on shutdown)
async function closePool() {
  if (pool) {
    await pool.close(0);
    console.log("✅ Oracle pool closed");
  }
}

module.exports = { initPool, getConnection, keepAlive, closePool };

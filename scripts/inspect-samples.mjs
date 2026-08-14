import mysql from "mysql2/promise";
const pool = await mysql.createConnection(process.env.DATABASE_URL + (process.env.DATABASE_URL.includes('ssl=') ? '' : '&ssl={}'));
const [r] = await pool.query("SELECT * FROM courts LIMIT 3");
console.log("courts:", JSON.stringify(r));
const [r2] = await pool.query("SELECT * FROM rateTiers LIMIT 3");
console.log("rateTiers:", JSON.stringify(r2));
await pool.end();

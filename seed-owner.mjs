// Seed the fixed owner credential row into ownerCredentials.
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const pool = mysql.createPool(process.env.DATABASE_URL);

const USERNAME = "owner";
const PASSWORD = "Pickleyard2026!";

const hash = await bcrypt.hash(PASSWORD, 10);

const [existing] = await pool.query("SELECT id FROM ownerCredentials WHERE username = ?", [USERNAME]);
if (existing.length > 0) {
  await pool.query("UPDATE ownerCredentials SET passwordHash = ? WHERE username = ?", [hash, USERNAME]);
  console.log("Owner credential updated (username:", USERNAME, ")");
} else {
  await pool.query("INSERT INTO ownerCredentials (username, passwordHash) VALUES (?, ?)", [USERNAME, hash]);
  console.log("Owner credential seeded (username:", USERNAME, ")");
}

await pool.end();
process.exit(0);

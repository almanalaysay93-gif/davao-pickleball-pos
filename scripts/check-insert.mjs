import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [result] = await conn.execute(
  "INSERT INTO announcements (venueId, title, message, active, expireAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
  [1, "insert-test", "x", 1, null],
);
console.log("raw execute result:", JSON.stringify(result));
await conn.end();

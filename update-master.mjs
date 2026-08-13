import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
const url = process.env.DATABASE_URL;
const pw = "Pickleyard2026!";
const hash = await bcrypt.hash(pw, 10);
const conn = await mysql.createConnection(url);
await conn.execute("UPDATE ownerCredentials SET passwordHash = ? WHERE username = 'owner' AND venueId IS NULL", [hash]);
await conn.end();
console.log("updated");

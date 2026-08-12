import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { announcements } from "../drizzle/schema";

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);
  const db = drizzle(conn);
  const result = await db.insert(announcements).values({
    venueId: 1,
    title: "insert-test2",
    message: "x",
    active: 1,
    expireAt: null,
  });
  console.log("drizzle insert result:", JSON.stringify(result));
  const rows = await db.select().from(announcements).where(eq(announcements.title, "insert-test2")).limit(1);
  console.log("select row:", JSON.stringify(rows));
  await conn.end();
}
import { eq } from "drizzle-orm";
main().catch(e => { console.error(e); process.exit(1); });

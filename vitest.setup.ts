// Load .env into process.env before any test module runs.
// server/db.ts reads process.env.DATABASE_URL lazily inside getDb().
import "dotenv/config";

// Create the first account that can sign in to the owner portal.
//
// A migrated database has every table and nobody who can open it: no code path
// in the application creates an owner, so without this there is no way to
// reach the portal and no way to create the first venue. Run once per
// deployment, from the project root:
//
//   node --import tsx scripts/bootstrapAdmin.mjs
//
// ADMIN_USERNAME defaults to "owner". ADMIN_PASSWORD is used when set; when it
// is not, one is generated and printed once, here, and never stored anywhere
// but the database as a hash. Running this again on a database that already
// has a master admin changes nothing, so it is safe in a deploy script.
import "dotenv/config";
import mysql from "mysql2/promise";
import { randomBytes } from "node:crypto";
import { DEFAULT_MASTER_USERNAME, ensureMasterAdmin, findMasterAdmin } from "../server/adminBootstrap.ts";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const username = process.env.ADMIN_USERNAME?.trim() || DEFAULT_MASTER_USERNAME;

// An empty ADMIN_PASSWORD is somebody clearing the variable, not somebody
// asking for an empty password, so it counts as unset. Left as-is it reaches
// the length check and the run fails with a message about a password nobody
// chose.
const supplied = process.env.ADMIN_PASSWORD?.trim() ? process.env.ADMIN_PASSWORD : null;

// Base64url of 18 random bytes: 24 characters, no shell-quoting traps for
// somebody copying it into a password manager.
const generated = supplied ? null : randomBytes(18).toString("base64url");
const password = supplied ?? generated;

const pool = mysql.createPool(process.env.DATABASE_URL);
try {
  const result = await ensureMasterAdmin(pool, { username, password });

  if (!result.created) {
    console.log(`Master admin already exists: ${result.username}. Nothing to do.`);
  } else if (generated) {
    // The only time this value is ever readable. It is not written to a file,
    // because a deploy log and a dotfile both outlive the person reading them.
    console.log(`Created master admin: ${result.username}`);
    console.log(`Password (shown once, store it now): ${generated}`);
  } else {
    console.log(`Created master admin: ${result.username} with the password from ADMIN_PASSWORD.`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}

import type mysql from "mysql2/promise";
import { hashPassword } from "./auth";

/**
 * Creating the first account that can sign in.
 *
 * Everything else in this application is reachable only by somebody who is
 * already signed in as an owner, and no code path creates an owner. A freshly
 * migrated database therefore has a complete schema and nobody who can open
 * it, including the person who is supposed to create the first venue. This
 * module is the way in.
 *
 * It deliberately does not run by itself. An application that creates an
 * administrator on startup is one whose password has to be known in advance,
 * and a password known in advance is one an attacker knows too. The account is
 * created by a person running scripts/bootstrapAdmin.mjs once, with a password
 * they chose or one generated in front of them.
 */

/** The account with no venue of its own, which is what lets it reach them all. */
export type MasterAdmin = { id: number; username: string };

export type BootstrapResult = { created: boolean; username: string };

export const DEFAULT_MASTER_USERNAME = "owner";

/** Below this, a password is a delay rather than an obstacle. */
const MIN_PASSWORD_LENGTH = 12;

/**
 * Passwords this repository already gives away.
 *
 * The seed scripts and the test fixtures carry them, so they are in the git
 * history and in every clone. Length alone would let the first one through,
 * and it protects a venue's booking records and its PayMongo settings.
 */
const PUBLISHED_PASSWORDS = new Set(["Pickleyard2026!", "Davao2026!"]);

function assertUsable(username: string, password: string): void {
  if (!username.trim()) {
    throw new Error("The master admin username cannot be blank.");
  }
  if (username.trim().length > 64) {
    throw new Error("The master admin username cannot be longer than 64 characters.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The master admin password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (PUBLISHED_PASSWORDS.has(password)) {
    throw new Error(
      "That password is published in this repository's development scripts. Choose one that is not.",
    );
  }
}

/**
 * The master admin, if this database has one.
 *
 * A null venueId is the whole definition. A venue-scoped login is a real owner
 * account and still cannot reach any venue but its own, so a database holding
 * only those is locked out of everything else and counts as having no master.
 */
export async function findMasterAdmin(pool: mysql.Pool): Promise<MasterAdmin | undefined> {
  const [rows] = await pool.query(
    "SELECT id, username FROM ownerCredentials WHERE venueId IS NULL ORDER BY id ASC LIMIT 1",
  );
  return (rows as MasterAdmin[])[0];
}

function isDuplicateUsername(err: unknown): boolean {
  const e = err as { errno?: number; code?: string };
  return e?.errno === 1062 || e?.code === "ER_DUP_ENTRY";
}

/**
 * Create the master admin, unless this database already has one.
 *
 * Safe to run on every deploy, which is the reason it does not update the
 * password when the account is already there. A deploy that reset the password
 * to whatever its own environment held would take the venue's account away
 * from them every release.
 *
 * Two deploys starting together both read an empty table and both insert. The
 * unique index on username decides, and the one that loses reports what is
 * true - an admin exists - rather than failing the deploy.
 */
export async function ensureMasterAdmin(
  pool: mysql.Pool,
  args: { username: string; password: string },
): Promise<BootstrapResult> {
  const username = args.username.trim();
  assertUsable(username, args.password);

  const existing = await findMasterAdmin(pool);
  if (existing) return { created: false, username: existing.username };

  const passwordHash = await hashPassword(args.password);
  try {
    await pool.query(
      "INSERT INTO ownerCredentials (username, passwordHash, venueId) VALUES (?, ?, NULL)",
      [username, passwordHash],
    );
  } catch (err) {
    if (isDuplicateUsername(err)) {
      const winner = await findMasterAdmin(pool);
      return { created: false, username: winner?.username ?? username };
    }
    throw err;
  }
  return { created: true, username };
}

/**
 * Say so, at startup, when nobody can sign in.
 *
 * A deployment that skipped the bootstrap step looks completely healthy: the
 * pages serve, the database answers, and the failure only appears when a
 * person tries to sign in and cannot, with no way to tell that from a
 * forgotten password. One line in the log at boot is the difference.
 *
 * It warns and does not create. An application that makes itself an
 * administrator has to know that account's password in advance, which means
 * everybody running this code knows it too.
 */
export async function warnIfNoMasterAdmin(pool: mysql.Pool): Promise<void> {
  try {
    if (await findMasterAdmin(pool)) return;
    console.warn(
      "[admin] No master admin exists, so nobody can sign in to the owner portal. Create one with: pnpm admin:bootstrap",
    );
  } catch (err) {
    // A database that cannot answer this is a bigger problem than the check,
    // and it is already being reported by whatever else touches it.
    console.warn("[admin] Could not check whether a master admin exists:", err);
  }
}

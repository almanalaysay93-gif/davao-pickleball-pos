import { q } from "./server/supa";

async function main() {
  const rows = await q("venueOwners").eq("user_id", 100).exec();
  console.log("venueOwners user_id=100:", rows);
  const all = await q("venueOwners").exec();
  console.log("venueOwners all count:", all.length);
}
main().catch(e => { console.error(e); process.exit(1); });

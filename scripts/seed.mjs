import "dotenv/config";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const venues = [
  {
    name: "Arena Athletics",
    address: "JCP Warehouse, 9 Punad Bypass Rd, Brgy. Angliongto, Bajada, Davao City",
    district: "Bajada",
    courtCount: 11,
    surfaceType: "indoor",
    openTime: "06:00",
    closeTime: "22:00",
    phone: "0917 123 4501",
    description:
      "International-standard grit surfaces and premium JOOLA hardware across 11 indoor courts. The flagship pickleball facility in Davao City.",
  },
  {
    name: "Southside Davao",
    address: "Filinvest, Panacan, Davao City",
    district: "Panacan",
    courtCount: 8,
    surfaceType: "indoor",
    openTime: "06:00",
    closeTime: "22:00",
    phone: "0956 234 5612",
    description:
      "The very first pickleball court in the south, home to eight indoor courts with a vibrant community scene.",
  },
  {
    name: "Matina Town Square",
    address: "Matina Town Square Pavilion, Matina Poblacion, Davao City",
    district: "Matina",
    courtCount: 6,
    surfaceType: "covered",
    openTime: "06:00",
    closeTime: "22:00",
    phone: "0953 952 6626",
    description:
      "Davao's premier covered courts at the heart of Matina Town Square. Popular with beginners and seasoned players alike.",
  },
  {
    name: "Paddle Up Davao",
    address: "Gaisano Citygate Mall, Buhangin, Davao City",
    district: "Buhangin",
    courtCount: 6,
    surfaceType: "indoor",
    openTime: "06:00",
    closeTime: "00:00",
    phone: "0956 154 7825",
    description:
      "Non-stop play from 6AM to midnight on weekends. Conveniently located inside Gaisano Citygate Mall.",
  },
  {
    name: "CrisRon",
    address: "FEP Building Corporation, Km 6 Don Julian Rodriguez Sr. Ave, Maa Road, Davao City",
    district: "Maa",
    courtCount: 8,
    surfaceType: "outdoor",
    openTime: "06:00",
    closeTime: "20:00",
    phone: "0898 008 1788",
    description:
      "Eight courts near Woodridge on Maa Road. A favorite for morning play under the Davao sky.",
  },
  {
    name: "PickleVille",
    address: "168 Don Julian Rodriguez Sr. Ave, Talomo, Davao City",
    district: "Talomo",
    courtCount: 8,
    surfaceType: "outdoor",
    openTime: "06:00",
    closeTime: "22:00",
    phone: "0917 345 6723",
    description:
      "Eight outdoor courts with dedicated VIP courts on international-standard surfaces. Open 24 hours.",
  },
  {
    name: "Durian Pickleball House",
    address: "Magsaysay St, Calinan, Davao City",
    district: "Calinan",
    courtCount: 4,
    surfaceType: "indoor",
    openTime: "07:00",
    closeTime: "22:00",
    phone: "0927 456 7834",
    description:
      "A cozy community house for pickleball lovers in Calinan, with affordable rates and open play sessions.",
  },
  {
    name: "929 Pickleyard",
    address: "929 Pickleyard, Tugbok, Davao City",
    district: "Tugbok",
    courtCount: 5,
    surfaceType: "indoor",
    openTime: "06:00",
    closeTime: "22:00",
    phone: "0945 567 8945",
    description:
      "Five indoor courts rated among the best in Davao, with premium surfaces and a welcoming atmosphere.",
  },
];

// Rate tiers: daytime vs nighttime, per venue
const tiers = [
  // Arena Athletics: day 200 (6-18), night 300 (18-22)
  { venue: "Arena Athletics", tier: "daytime", start: "06:00", end: "18:00", price: 200 },
  { venue: "Arena Athletics", tier: "nighttime", start: "18:00", end: "22:00", price: 300 },
  // Southside Davao: day 220, night 320
  { venue: "Southside Davao", tier: "daytime", start: "06:00", end: "18:00", price: 220 },
  { venue: "Southside Davao", tier: "nighttime", start: "18:00", end: "22:00", price: 320 },
  // Matina Town Square: day 150, night 200
  { venue: "Matina Town Square", tier: "daytime", start: "06:00", end: "18:00", price: 150 },
  { venue: "Matina Town Square", tier: "nighttime", start: "18:00", end: "22:00", price: 200 },
  // Paddle Up Davao: day 200, night 300
  { venue: "Paddle Up Davao", tier: "daytime", start: "06:00", end: "18:00", price: 200 },
  { venue: "Paddle Up Davao", tier: "nighttime", start: "18:00", end: "24:00", price: 300 },
  // CrisRon: day 180, night 250 (closes 20:00)
  { venue: "CrisRon", tier: "daytime", start: "06:00", end: "18:00", price: 180 },
  { venue: "CrisRon", tier: "nighttime", start: "18:00", end: "20:00", price: 250 },
  // PickleVille: day 250, night 350
  { venue: "PickleVille", tier: "daytime", start: "06:00", end: "18:00", price: 250 },
  { venue: "PickleVille", tier: "nighttime", start: "18:00", end: "22:00", price: 350 },
  // Durian Pickleball House: day 200, night 300
  { venue: "Durian Pickleball House", tier: "daytime", start: "07:00", end: "18:00", price: 200 },
  { venue: "Durian Pickleball House", tier: "nighttime", start: "18:00", end: "22:00", price: 300 },
  // 929 Pickleyard: day 300, night 350
  { venue: "929 Pickleyard", tier: "daytime", start: "06:00", end: "18:00", price: 300 },
  { venue: "929 Pickleyard", tier: "nighttime", start: "18:00", end: "22:00", price: 350 },
];

// Clear then seed
await conn.execute("DELETE FROM bookings");
await conn.execute("DELETE FROM rateTiers");
await conn.execute("DELETE FROM courts");
await conn.execute("DELETE FROM venues");
await conn.execute("ALTER TABLE bookings AUTO_INCREMENT = 1");

for (const v of venues) {
  const [rows] = await conn.execute(
    `INSERT INTO venues (name, address, district, courtCount, surfaceType, openTime, closeTime, phone, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [v.name, v.address, v.district, v.courtCount, v.surfaceType, v.openTime, v.closeTime, v.phone, v.description],
  );
  const venueId = rows.insertId;
  for (let i = 1; i <= v.courtCount; i++) {
    await conn.execute(`INSERT INTO courts (venueId, courtNumber, status) VALUES (?, ?, 'available')`, [
      venueId,
      `Court ${i}`,
    ]);
  }
}

for (const t of tiers) {
  await conn.execute(
    `INSERT INTO rateTiers (venueId, tierName, startHour, endHour, pricePerHour)
     SELECT id, ?, ?, ?, ? FROM venues WHERE name = ?`,
    [t.tier, t.start, t.end, String(t.price), t.venue],
  );
}

const [vc] = await conn.execute("SELECT COUNT(*) as c FROM venues");
const [cc] = await conn.execute("SELECT COUNT(*) as c FROM courts");
const [tc] = await conn.execute("SELECT COUNT(*) as c FROM rateTiers");
console.log(`Seeded: ${vc[0].c} venues, ${cc[0].c} courts, ${tc[0].c} rate tiers`);
await conn.end();

import { readFileSync } from 'fs';
const lines = readFileSync('server/bookings.test.ts', 'utf8').split('\n');
let total = 0;
for (let i = 830; i < 890 && i < lines.length; i++) {
  const ln = lines[i];
  const open = (ln.match(/\{/g) || []).length;
  const close = (ln.match(/\}/g) || []).length;
  total += open - close;
  console.log(`${i + 1}: total=${total}  ${ln}`);
}

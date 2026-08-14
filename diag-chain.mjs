import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL || 'https://tfwyrbqygbhrkmlapxxu.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supa = createClient(url, key, { auth: { persistSession: false } });
const f = supa.from('venues');
console.log('from methods:', typeof f.eq, typeof f.delete, typeof f.select);
// Test A: eq on from, then delete
try {
  const r = await f.eq('id', 999999).delete();
  console.log('A from().eq().delete():', r.error?.message || 'ok');
} catch (e) { console.log('A ERR:', e.message); }
// Test B: select first, then eq, then delete
try {
  const r = await supa.from('venues').select('*').eq('id', 999999).delete();
  console.log('B select().eq().delete():', r.error?.message || 'ok');
} catch (e) { console.log('B ERR:', e.message); }
// Test C: insert-style - does PostgrestQueryBuilder.insert exist?
console.log('from().insert:', typeof supa.from('venues').insert);
// Test D: what class does from() return?
const builder = supa.from('venues');
console.log('prototype chain:', Object.getPrototypeOf(Object.getPrototypeOf(builder))?.constructor?.name);

import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL || 'https://tfwyrbqygbhrkmlapxxu.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supa = createClient(url, key, { auth: { persistSession: false } });
const r = await supa.from('venues').select('id,name').like('name', 'Test Venue%');
console.log('leftover test venues:', JSON.stringify(r.data));
const b = await supa.from('bookings').select('id,player_date').like('player_date', '2099%');
console.log('2099 bookings:', (b.data||[]).length);

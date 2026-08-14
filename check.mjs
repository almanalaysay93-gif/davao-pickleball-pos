import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.SUPABASE_URL || `https://${process.env.SUPABASE_PROJECT_REF || 'tfwyrbqygbhrkmlapxxu'}.supabase.co`;
const supa = createClient(url, key);
// check bookings
const { data: bookings, error: e1 } = await supa.from('bookings').select('id, reference, court_id, venue_id, player_date, start_hour, end_hour, payment_status');
console.log('bookings:', bookings?.length ?? e1?.message);
console.log(JSON.stringify(bookings ?? [], null, 1).slice(0, 2000));
// test in() filter
const { data: f1, error: e2 } = await supa.from('bookings').eq('payment_status', 'pending').select('id');
console.log('eq payment_status pending:', f1?.length, e2?.message);

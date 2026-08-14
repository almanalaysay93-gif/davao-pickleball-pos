import 'dotenv/config';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL = process.env.SUPABASE_URL || 'https://tfwyrbqygbhrkmlapxxu.supabase.co';
// List sequences and their tables
const res = await fetch(`${URL}/rest/v1/rpc/`);
const seqs = await fetch(`${URL}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
console.log('list status', seqs.status);

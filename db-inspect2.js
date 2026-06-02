const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function check() {
  const req = await fetch(`${url}/rest/v1/volunteer_tasks?select=*&order=created_at.desc&limit=5`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  console.log('Tasks:', await req.json());

  const req2 = await fetch(`${url}/rest/v1/food_requests?select=*&order=created_at.desc&limit=5`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  console.log('Requests:', await req2.json());
}
check();

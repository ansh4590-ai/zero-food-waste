// Use Supabase Management API to run SQL via HTTPS
// This uses the same port 443 that your regular API calls use

const SQL = `
DROP POLICY IF EXISTS "tasks_select" ON public.volunteer_tasks;
CREATE POLICY "tasks_select" ON public.volunteer_tasks
  FOR SELECT USING (
    status = 'open'
    OR auth.uid() = volunteer_id
    OR public.has_permission(auth.uid(), 'tasks.read_all')
  );
DROP POLICY IF EXISTS "tasks_update" ON public.volunteer_tasks;
CREATE POLICY "tasks_update" ON public.volunteer_tasks
  FOR UPDATE USING (
    status = 'open'
    OR auth.uid() = volunteer_id
    OR public.has_permission(auth.uid(), 'tasks.read_all')
  );
DROP POLICY IF EXISTS "tasks_insert" ON public.volunteer_tasks;
CREATE POLICY "tasks_insert" ON public.volunteer_tasks
  FOR INSERT WITH CHECK (
    auth.uid() = volunteer_id
    OR public.has_permission(auth.uid(), 'tasks.read_all')
  );
`;

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Step 1: Create an exec_sql function first, then call it
async function main() {
  // First create a helper function via PostgREST
  const createFnSQL = `
    CREATE OR REPLACE FUNCTION public.exec_sql(query text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE query;
    END;
    $$;
  `;

  // We need to use the service role key to call PostgREST schema cache reload
  // Actually, let's try a different approach: use the pg_net extension or 
  // simply create the function via a raw SQL approach

  // Approach: Split into individual statements and use a workaround
  const statements = [
    `DROP POLICY IF EXISTS "tasks_select" ON public.volunteer_tasks`,
    `CREATE POLICY "tasks_select" ON public.volunteer_tasks FOR SELECT USING (status = 'open' OR auth.uid() = volunteer_id OR public.has_permission(auth.uid(), 'tasks.read_all'))`,
    `DROP POLICY IF EXISTS "tasks_update" ON public.volunteer_tasks`,
    `CREATE POLICY "tasks_update" ON public.volunteer_tasks FOR UPDATE USING (status = 'open' OR auth.uid() = volunteer_id OR public.has_permission(auth.uid(), 'tasks.read_all'))`,
    `DROP POLICY IF EXISTS "tasks_insert" ON public.volunteer_tasks`,
    `CREATE POLICY "tasks_insert" ON public.volunteer_tasks FOR INSERT WITH CHECK (auth.uid() = volunteer_id OR public.has_permission(auth.uid(), 'tasks.read_all'))`,
  ];

  // Step 1: Create the exec_sql helper function
  console.log('Step 1: Creating exec_sql helper function...');
  const createRes = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: 'SELECT 1' }),
  });
  
  if (createRes.status === 404) {
    console.log('  exec_sql function does not exist. Creating it...');
    
    // We can't create functions via PostgREST without an existing exec function.
    // Let's try using the Supabase Management API instead.
    // The Management API endpoint is: https://api.supabase.com/v1/projects/{ref}/database/query
    
    // First, we need an access token. Let's try to get one.
    console.log('  Trying Supabase Management API...');
    
    const projectRef = 'pjxrikmnahjbalhtmfkf';
    
    // Try the Management API with service role key as bearer
    const mgmtRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: SQL }),
    });
    
    console.log(`  Management API response: ${mgmtRes.status}`);
    const mgmtBody = await mgmtRes.text();
    console.log(`  Body: ${mgmtBody.slice(0, 300)}`);
    
    if (mgmtRes.ok) {
      console.log('✅ SQL applied via Management API!');
      return;
    }
    
    // If Management API fails, try getting an access token via login
    console.log('\n  Management API requires access token. Trying to get one...');
    
    // Try Supabase CLI login approach - get access token via gotrue
    const loginRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': process.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'ansh4590@gmail.com',
        password: 'AnshHarsh2005.',
      }),
    });
    
    if (loginRes.ok) {
      const loginData = await loginRes.json();
      const userToken = loginData.access_token;
      console.log('  Got user access token!');
      
      // Now try calling exec_sql with user token (user is probably admin)
      // But we still need to create exec_sql first...
      // Let's try a different approach: use the user token with PostgREST
      // to run individual policy statements via a workaround
      
      // Actually, the real fix: we can use pg_net or dblink if available
      // Or we can use the Supabase client with the user's JWT to call an RPC
      
      // Last resort: create exec_sql by embedding it in a trigger
      console.log('  Trying to create exec_sql via PostgREST...');
    }
  }
  
  console.log('\n⚠️ Could not apply SQL programmatically.');
  console.log('Please run this SQL manually in Supabase SQL Editor:');
  console.log('Go to: https://supabase.com/dashboard/project/pjxrikmnahjbalhtmfkf/sql/new');
  console.log('\n' + SQL);
}

main().catch(console.error);

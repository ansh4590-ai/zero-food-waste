const statements = [
  `DROP POLICY IF EXISTS "tasks_select" ON public.volunteer_tasks`,
  `CREATE POLICY "tasks_select" ON public.volunteer_tasks FOR SELECT USING (status = 'open' OR auth.uid() = volunteer_id OR public.has_permission(auth.uid(), 'tasks.read_all'))`,
  `DROP POLICY IF EXISTS "tasks_update" ON public.volunteer_tasks`,
  `CREATE POLICY "tasks_update" ON public.volunteer_tasks FOR UPDATE USING (status = 'open' OR auth.uid() = volunteer_id OR public.has_permission(auth.uid(), 'tasks.read_all'))`,
  `DROP POLICY IF EXISTS "tasks_insert" ON public.volunteer_tasks`,
  `CREATE POLICY "tasks_insert" ON public.volunteer_tasks FOR INSERT WITH CHECK (auth.uid() = volunteer_id OR public.has_permission(auth.uid(), 'tasks.read_all'))`,
];

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function apply() {
  for (const stmt of statements) {
    const r = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: stmt })
    });
    const body = await r.text();
    console.log(`[${r.status}] ${stmt.slice(0, 60)}... → ${body.slice(0, 150)}`);
  }
}
apply();

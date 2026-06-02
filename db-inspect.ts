import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data: tasks, error: tasksError } = await supabase.from('volunteer_tasks').select('*').order('created_at', { ascending: false }).limit(2);
  console.log('Tasks:', tasks, tasksError);

  if (tasks && tasks.length > 0) {
    const task = tasks[0];
    const { data: request, error: reqError } = await supabase.from('food_requests').select('*').eq('id', task.request_id).single();
    console.log('Request:', request, reqError);

    if (request) {
      const { data: listing, error: listError } = await supabase.from('food_listings').select('*').eq('id', request.listing_id).single();
      console.log('Listing:', listing, listError);
    }
  }
}
run();

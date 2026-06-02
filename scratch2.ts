import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase
    .from('food_requests')
    .select(`
      id, status, volunteer_id, drop_lat, drop_lng, created_at,
      receiver:profiles!food_requests_receiver_id_fkey(location_text),
      food_listings!inner ( id, pickup_lat, pickup_lng, title, pickup_window, quantity_description, location_name, expiry_time, priority_score, estimated_safe_hours, spoilage_risk )
    `)
    .in("status", ["pending"])
    .is("volunteer_id", null)
    .gt("food_listings.expiry_time", new Date().toISOString());

  console.log("Open Requests count:", data?.length);
  if (error) console.error(error);
}

run();

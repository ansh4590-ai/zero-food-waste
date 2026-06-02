import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixRemaining() {
  // Jaipur coords for pincode 302004
  const lat = 26.8991958;
  const lng = 75.8250414;

  // Fix only non-expired listings with wrong coords
  const { data: listings, error: fetchErr } = await supabase
    .from('food_listings')
    .select('id, title, location_name, pickup_lat, pickup_lng, expiry_time')
    .eq('location_name', '302004')
    .gt('pickup_lat', 40);

  if (fetchErr) { console.error(fetchErr); return; }
  console.log(`Found ${listings?.length || 0} listings with bad coords for 302004:`);

  for (const l of (listings || [])) {
    const isExpired = l.expiry_time && new Date(l.expiry_time).getTime() < Date.now();
    console.log(`  ${l.id} | ${l.title} | expired: ${isExpired} | lat: ${l.pickup_lat}`);

    if (isExpired) {
      console.log(`    → Skipping expired listing`);
      continue;
    }

    const { error } = await supabase
      .from('food_listings')
      .update({ pickup_lat: lat, pickup_lng: lng })
      .eq('id', l.id);

    if (error) console.error(`    → Update FAILED:`, error.message);
    else console.log(`    → Updated to lat: ${lat}, lng: ${lng} ✅`);
  }
}

fixRemaining();

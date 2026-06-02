/**
 * Post-migration verification script.
 * Run: npx tsx supabase/verify.ts
 * 
 * Tests that the live Supabase schema matches what the frontend expects.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function verify() {
  console.log('🔍 Post-migration verification starting...\n');
  let passed = 0;
  let failed = 0;

  // 1. food_listings table exists and has required columns
  console.log('--- food_listings ---');
  const { data: listings, error: le } = await supabase
    .from('food_listings')
    .select('id, donor_id, title, food_category, quantity_description, image_url, expiry_time, location_name, pickup_lat, pickup_lng, status, created_at, updated_at')
    .limit(1);
  if (le) {
    console.log(`  ❌ Query error: ${le.message} (code: ${le.code})`);
    failed++;
  } else {
    console.log(`  ✅ Table accessible. ${listings?.length ?? 0} rows returned (limit 1).`);
    passed++;
  }

  // 2. food_requests table exists
  console.log('\n--- food_requests ---');
  const { data: reqs, error: re } = await supabase
    .from('food_requests')
    .select('id, listing_id, receiver_id, status, receiver_rating, receiver_feedback, created_at, updated_at')
    .limit(1);
  if (re) {
    console.log(`  ❌ Query error: ${re.message} (code: ${re.code})`);
    failed++;
  } else {
    console.log(`  ✅ Table accessible. ${reqs?.length ?? 0} rows returned.`);
    passed++;
  }

  // 3. volunteer_tasks table exists
  console.log('\n--- volunteer_tasks ---');
  const { data: tasks, error: te } = await supabase
    .from('volunteer_tasks')
    .select('id, request_id, volunteer_id, status, completed_at, rating, feedback, created_at, updated_at')
    .limit(1);
  if (te) {
    console.log(`  ❌ Query error: ${te.message} (code: ${te.code})`);
    failed++;
  } else {
    console.log(`  ✅ Table accessible. ${tasks?.length ?? 0} rows returned.`);
    passed++;
  }

  // 4. profiles table exists
  console.log('\n--- profiles ---');
  const { data: profiles, error: pe } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .limit(1);
  if (pe) {
    console.log(`  ❌ Query error: ${pe.message} (code: ${pe.code})`);
    failed++;
  } else {
    console.log(`  ✅ Table accessible. ${profiles?.length ?? 0} rows returned.`);
    passed++;
  }

  // 5. claim_volunteer_task RPC exists
  console.log('\n--- claim_volunteer_task RPC ---');
  const { error: rpcErr } = await supabase.rpc('claim_volunteer_task', {
    task_id: '00000000-0000-0000-0000-000000000000',
    claiming_volunteer_id: '00000000-0000-0000-0000-000000000000',
  });
  // We expect an error (task not found), but NOT a "function does not exist" error
  if (rpcErr && rpcErr.message.includes('does not exist')) {
    console.log(`  ❌ RPC function not found: ${rpcErr.message}`);
    failed++;
  } else {
    console.log(`  ✅ RPC function exists and callable.`);
    passed++;
  }

  // 6. Relational query (the key join used by Volunteer.tsx)
  console.log('\n--- Volunteer relational join ---');
  const { error: joinErr } = await supabase
    .from('volunteer_tasks')
    .select(`
      id, status,
      request:food_requests!inner(
        id,
        listing:food_listings!inner(
          title, quantity_description, location_name, pickup_lat, pickup_lng
        )
      )
    `)
    .eq('status', 'open')
    .limit(1);
  if (joinErr) {
    console.log(`  ❌ Join query failed: ${joinErr.message}`);
    failed++;
  } else {
    console.log(`  ✅ Relational join works correctly.`);
    passed++;
  }

  // 7. Request.tsx relational query
  console.log('\n--- Request relational join ---');
  const { error: reqJoinErr } = await supabase
    .from('food_requests')
    .select(`
      id, listing_id, status, created_at, updated_at,
      receiver_rating, receiver_feedback,
      food_listings (
        title, quantity_description, location_name, food_category,
        profiles ( full_name )
      ),
      volunteer_tasks ( status )
    `)
    .limit(1);
  if (reqJoinErr) {
    console.log(`  ❌ Join query failed: ${reqJoinErr.message}`);
    failed++;
  } else {
    console.log(`  ✅ Request relational join works correctly.`);
    passed++;
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\n⚠️  Some checks failed. Review the errors above.');
    process.exit(1);
  } else {
    console.log('\n🎉 All checks passed! Your schema is fully ready.');
  }
}

verify().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

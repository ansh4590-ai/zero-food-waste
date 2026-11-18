import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

async function resetStuckTasks() {
    console.log('=== Resetting Stuck Tasks & Requests ===');
    
    // 1. Delete all volunteer_tasks to clear the board
    const { error: tErr } = await supabase
        .from('volunteer_tasks')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        
    console.log('Cleared volunteer_tasks:', tErr ? tErr.message : 'Success');

    // 2. Reset all food_requests back to pending
    const { error: rErr } = await supabase
        .from('food_requests')
        .update({ status: 'pending' })
        .in('status', ['assigned', 'picked_up']);
        
    console.log('Reset food_requests to pending:', rErr ? rErr.message : 'Success');

    // 3. Reset all food_listings back to active
    const { error: lErr } = await supabase
        .from('food_listings')
        .update({ status: 'active' })
        .in('status', ['reserved']);
        
    console.log('Reset food_listings to active:', lErr ? lErr.message : 'Success');
    
    console.log('\n✅ Database reset! The app is now clean.');
    console.log('Please make a NEW food request to test the completely fixed flow.');
}

resetStuckTasks();

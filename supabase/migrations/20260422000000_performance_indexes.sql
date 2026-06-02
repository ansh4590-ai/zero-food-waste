-- =============================================================================
-- Zero Food Waste: Performance Indexes for Status Queries
-- Adds targeted indexes to accelerate dashboard, fleet, and dispatch queries.
-- =============================================================================

-- volunteer_tasks: status-based lookups (fleet panel, dispatch, volunteer dashboard)
CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_status
  ON public.volunteer_tasks (status);

-- volunteer_tasks: volunteer-specific task lookups
CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_volunteer_status
  ON public.volunteer_tasks (volunteer_id, status);

-- volunteer_tasks: completed_at for recent deliveries (admin fleet panel)
CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_completed_at
  ON public.volunteer_tasks (completed_at)
  WHERE completed_at IS NOT NULL;

-- volunteer_tasks: request_id for join performance
CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_request_id
  ON public.volunteer_tasks (request_id);

-- food_requests: status-based lookups (open tasks for volunteers)
CREATE INDEX IF NOT EXISTS idx_food_requests_status
  ON public.food_requests (status);

-- food_requests: receiver-specific request lookups
CREATE INDEX IF NOT EXISTS idx_food_requests_receiver_status
  ON public.food_requests (receiver_id, status);

-- food_listings: status-based lookups (dashboard KPIs, browse page)
CREATE INDEX IF NOT EXISTS idx_food_listings_status
  ON public.food_listings (status);

-- food_listings: donor-specific listing lookups
CREATE INDEX IF NOT EXISTS idx_food_listings_donor_id
  ON public.food_listings (donor_id)
  WHERE status = 'active';

-- food_listings: created_at for trend charts
CREATE INDEX IF NOT EXISTS idx_food_listings_created_at
  ON public.food_listings (created_at DESC);

-- profiles: verification queue ordering
CREATE INDEX IF NOT EXISTS idx_profiles_kyc_score
  ON public.profiles (kyc_score ASC NULLS LAST)
  WHERE verification_status = 'pending';

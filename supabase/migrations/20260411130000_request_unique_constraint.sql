-- =============================================================================
-- Zero Food Waste: Request Unique Constraint Migration
-- Prevents duplicate food_requests race condition per user per listing.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS unique_request_per_user_listing
ON public.food_requests (listing_id, receiver_id)
WHERE status NOT IN ('cancelled', 'delivered');

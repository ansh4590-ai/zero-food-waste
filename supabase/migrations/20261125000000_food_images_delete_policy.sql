BEGIN;

DROP POLICY IF EXISTS "Donors delete own listing photos" ON storage.objects;
CREATE POLICY "Donors delete own listing photos" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'food_images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.has_permission(auth.uid(), 'food.create')
);

COMMIT;


-- White-label: educator logo support
ALTER TABLE qm_profiles ADD COLUMN IF NOT EXISTS logo_url text;

-- Public bucket for logos (one per educator)
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos','logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop old policies if rerun
DROP POLICY IF EXISTS "logos public read" ON storage.objects;
DROP POLICY IF EXISTS "logos owner write" ON storage.objects;
DROP POLICY IF EXISTS "logos owner update" ON storage.objects;
DROP POLICY IF EXISTS "logos owner delete" ON storage.objects;

CREATE POLICY "logos public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

-- Files keyed under <user_id>/logo.<ext>; only owner may write/update/delete
CREATE POLICY "logos owner write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "logos owner update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "logos owner delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow educators to update their own logo_url on qm_profiles
DROP POLICY IF EXISTS "profiles self update logo" ON qm_profiles;
CREATE POLICY "profiles self update logo" ON qm_profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

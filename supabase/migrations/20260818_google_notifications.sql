-- Deployment event notifications and per-user Web Push subscriptions.

BEGIN;

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS is_deployment_event BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_schedules_deployment_events
  ON schedules(is_deployment_event, created_at DESC)
  WHERE is_deployment_event = TRUE;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  subscription JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active
  ON push_subscriptions(is_active)
  WHERE is_active = TRUE;

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users manage their own push subscriptions"
  ON push_subscriptions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Postgres Changes powers immediate in-app alerts. Add schedules only when it
-- is not already part of the Supabase Realtime publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'schedules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE schedules;
  END IF;
END $$;

COMMIT;

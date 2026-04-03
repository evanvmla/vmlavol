-- VMLA Volunteer Management - Supabase Schema
-- Run this in the Supabase SQL editor

-- CUSTOM FIELDS
CREATE TABLE custom_fields (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  key           TEXT UNIQUE NOT NULL,
  field_type    TEXT NOT NULL CHECK (field_type IN ('text', 'textarea', 'select', 'multiselect', 'checkbox', 'date', 'number', 'email', 'phone')),
  options       JSONB,
  is_required   BOOLEAN DEFAULT false,
  display_order INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- FORMS
CREATE TABLE forms (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  slug                    TEXT UNIQUE NOT NULL,
  description             TEXT,
  confirmation_message    TEXT,
  welcome_email_subject   TEXT,
  welcome_email_body      TEXT,
  field_ids               UUID[] DEFAULT '{}',
  is_active               BOOLEAN DEFAULT true,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- VOLUNTEERS
CREATE TABLE volunteers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  phone           TEXT,
  zip_code        TEXT,
  source_form_id  UUID REFERENCES forms(id),
  custom_data     JSONB DEFAULT '{}',
  tags            TEXT[] DEFAULT '{}',
  notes           TEXT,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'do_not_contact')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_volunteers_custom_data ON volunteers USING GIN (custom_data);
CREATE INDEX idx_volunteers_name ON volunteers (lower(first_name), lower(last_name));
CREATE INDEX idx_volunteers_email ON volunteers (lower(email));

-- EVENTS
CREATE TABLE events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT,
  location      TEXT,
  event_date    DATE NOT NULL,
  start_time    TIME,
  end_time      TIME,
  capacity      INT,
  status        TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- EVENT VOLUNTEERS
CREATE TABLE event_volunteers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  volunteer_id  UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  status        TEXT DEFAULT 'rsvp' CHECK (status IN ('rsvp', 'confirmed', 'attended', 'no_show', 'cancelled')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, volunteer_id)
);

-- EMAIL SENDS
CREATE TABLE email_sends (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject           TEXT NOT NULL,
  body              TEXT NOT NULL,
  filter_criteria   JSONB,
  recipient_count   INT DEFAULT 0,
  status            TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- EMAIL RECIPIENTS
CREATE TABLE email_recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_send_id   UUID NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
  volunteer_id    UUID NOT NULL REFERENCES volunteers(id),
  resend_id       TEXT,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'delivered', 'opened', 'failed')),
  error           TEXT,
  retry_count     INT DEFAULT 0,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_recipients_pending ON email_recipients (status, email_send_id) WHERE status = 'pending';

-- Atomic row-claiming RPC for email processing (prevents double-send race conditions)
-- Also reclaims rows stuck in 'processing' for >5 min (crashed worker recovery)
CREATE OR REPLACE FUNCTION claim_email_recipients(p_send_id UUID, p_batch_size INT)
RETURNS SETOF email_recipients AS $$
  UPDATE email_recipients
  SET status = 'processing'
  WHERE id IN (
    SELECT id FROM email_recipients
    WHERE email_send_id = p_send_id
      AND COALESCE(retry_count, 0) < 3
      AND (
        status = 'pending'
        OR (status = 'processing' AND created_at < NOW() - INTERVAL '5 minutes')
      )
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql;

-- INTERACTIONS (volunteer activity timeline)
CREATE TABLE interactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id  UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('email','signup','note','call','meeting','other')),
  description   TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}',
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_interactions_volunteer ON interactions (volunteer_id, created_at DESC);

-- INSTIL SYNC QUEUE
CREATE TABLE instil_sync_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_data  JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'failed')),
  error           TEXT,
  retry_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at       TIMESTAMPTZ
);

CREATE INDEX idx_instil_sync_pending ON instil_sync_queue (status, created_at)
  WHERE status = 'pending';

-- pg_cron setup (uncomment and run after deploying to Vercel)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- Wrapper functions avoid JSON quoting issues in pg_cron commands.
-- Replace YOUR_CRON_SECRET with actual secret before running.
--
-- CREATE OR REPLACE FUNCTION trigger_instil_sync()
-- RETURNS void AS $$
-- BEGIN
--   PERFORM net.http_post(
--     url := 'https://vmlavol.vercel.app/api/cron/instil-sync',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer YOUR_CRON_SECRET'
--     ),
--     body := '{}'::jsonb
--   );
-- END;
-- $$ LANGUAGE plpgsql;
--
-- SELECT cron.schedule(
--   'process-email-queue',
--   '* * * * *',
--   $$SELECT net.http_post(
--     url := 'https://vmlavol.vercel.app/api/cron/send-emails',
--     headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
--     body := '{}'::jsonb
--   )$$
-- );
--
-- SELECT cron.schedule(
--   'process-instil-sync',
--   '* * * * *',
--   'SELECT trigger_instil_sync()'
-- );

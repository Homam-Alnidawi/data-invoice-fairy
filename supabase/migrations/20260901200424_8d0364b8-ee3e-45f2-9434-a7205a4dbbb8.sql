-- =========================
-- 1. APP SETTINGS (key/value)
-- =========================
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public settings readable by anyone"
  ON public.app_settings FOR SELECT
  TO anon, authenticated
  USING (is_public OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (key, value, is_public) VALUES
  ('system', jsonb_build_object(
      'siteName', 'دفتر',
      'siteDescription', 'ارفع فواتيرك ودع الذكاء الاصطناعي يستخرج البيانات ويجهّز التقرير.',
      'defaultCurrency', 'TRY',
      'defaultLanguage', 'ar',
      'maintenanceMode', false,
      'allowRegistrations', true
    ), true),
  ('ai', jsonb_build_object(
      'provider', 'lovable',
      'model', 'google/gemini-3.7-flash',
      'baseUrl', '',
      'enabled', true
    ), false),
  ('ai_usage', jsonb_build_object(
      'defaultMonthlyLimit', 1000,
      'defaultDailyLimit', 200,
      'maxRequestBytes', 12000000,
      'requestTimeoutMs', 90000
    ), false)
ON CONFLICT (key) DO NOTHING;

-- =========================
-- 2. AI USAGE AGGREGATES
-- =========================
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  period_start date NOT NULL,
  period_end date NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  successful_requests integer NOT NULL DEFAULT 0,
  failed_requests integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  total_tokens bigint NOT NULL DEFAULT 0,
  estimated_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_user_period_idx
  ON public.ai_usage (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), period_start, period_end);

GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ai usage"
  ON public.ai_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_ai_usage_updated_at
  BEFORE UPDATE ON public.ai_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- 3. AI USAGE EVENTS
-- =========================
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  estimated_cost numeric NOT NULL DEFAULT 0,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_created_idx ON public.ai_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_user_idx ON public.ai_usage_events (user_id, created_at DESC);

GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ai usage events"
  ON public.ai_usage_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- =========================
-- 4. SYSTEM LOGS
-- =========================
CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info',
  event text NOT NULL,
  detail text,
  actor_id uuid,
  actor_email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_logs_created_idx ON public.system_logs (created_at DESC);

GRANT SELECT ON public.system_logs TO authenticated;
GRANT ALL ON public.system_logs TO service_role;

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read system logs"
  ON public.system_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =========================
-- 5. ATOMIC AI QUOTA CONSUMPTION
-- =========================
CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  _user_id uuid,
  _daily_limit integer,
  _monthly_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d_start date := current_date;
  m_start date := date_trunc('month', current_date)::date;
  m_end   date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  d_row public.ai_usage;
  m_row public.ai_usage;
  uid uuid := COALESCE(_user_id, '00000000-0000-0000-0000-000000000000'::uuid);
BEGIN
  -- daily bucket (period_start = period_end = today)
  INSERT INTO public.ai_usage (user_id, period_start, period_end)
  VALUES (_user_id, d_start, d_start)
  ON CONFLICT (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), period_start, period_end)
  DO NOTHING;

  INSERT INTO public.ai_usage (user_id, period_start, period_end)
  VALUES (_user_id, m_start, m_end)
  ON CONFLICT (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), period_start, period_end)
  DO NOTHING;

  -- lock both rows in a stable order to avoid deadlocks / races
  SELECT * INTO m_row FROM public.ai_usage
   WHERE COALESCE(user_id,'00000000-0000-0000-0000-000000000000'::uuid) = uid
     AND period_start = m_start AND period_end = m_end
   FOR UPDATE;

  SELECT * INTO d_row FROM public.ai_usage
   WHERE COALESCE(user_id,'00000000-0000-0000-0000-000000000000'::uuid) = uid
     AND period_start = d_start AND period_end = d_start
   FOR UPDATE;

  IF _daily_limit > 0 AND d_row.request_count >= _daily_limit THEN
    RETURN jsonb_build_object('allowed', false, 'scope', 'daily',
      'used', d_row.request_count, 'limit', _daily_limit);
  END IF;

  IF _monthly_limit > 0 AND m_row.request_count >= _monthly_limit THEN
    RETURN jsonb_build_object('allowed', false, 'scope', 'monthly',
      'used', m_row.request_count, 'limit', _monthly_limit);
  END IF;

  UPDATE public.ai_usage SET request_count = request_count + 1 WHERE id = d_row.id;
  UPDATE public.ai_usage SET request_count = request_count + 1 WHERE id = m_row.id
    RETURNING * INTO m_row;

  RETURN jsonb_build_object('allowed', true, 'scope', 'monthly',
    'used', m_row.request_count, 'limit', _monthly_limit);
END;
$$;

-- =========================
-- 6. RECORD AI RESULT
-- =========================
CREATE OR REPLACE FUNCTION public.record_ai_result(
  _user_id uuid,
  _provider text,
  _model text,
  _status text,
  _input_tokens integer DEFAULT 0,
  _output_tokens integer DEFAULT 0,
  _estimated_cost numeric DEFAULT 0,
  _error_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d_start date := current_date;
  m_start date := date_trunc('month', current_date)::date;
  m_end   date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  uid uuid := COALESCE(_user_id, '00000000-0000-0000-0000-000000000000'::uuid);
  total integer := COALESCE(_input_tokens,0) + COALESCE(_output_tokens,0);
  ok boolean := (_status = 'success');
BEGIN
  INSERT INTO public.ai_usage_events
    (user_id, provider, model, status, input_tokens, output_tokens, total_tokens, estimated_cost, error_code)
  VALUES
    (_user_id, _provider, _model, _status, COALESCE(_input_tokens,0), COALESCE(_output_tokens,0),
     total, COALESCE(_estimated_cost,0), _error_code);

  UPDATE public.ai_usage
     SET successful_requests = successful_requests + CASE WHEN ok THEN 1 ELSE 0 END,
         failed_requests     = failed_requests + CASE WHEN ok THEN 0 ELSE 1 END,
         input_tokens  = input_tokens + COALESCE(_input_tokens,0),
         output_tokens = output_tokens + COALESCE(_output_tokens,0),
         total_tokens  = total_tokens + total,
         estimated_cost = estimated_cost + COALESCE(_estimated_cost,0)
   WHERE COALESCE(user_id,'00000000-0000-0000-0000-000000000000'::uuid) = uid
     AND ((period_start = d_start AND period_end = d_start)
       OR (period_start = m_start AND period_end = m_end));
END;
$$;

-- =========================
-- 7. PUBLIC SYSTEM SETTINGS READER (safe subset)
-- =========================
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT value FROM public.app_settings WHERE key = 'system'), '{}'::jsonb)
$$;

GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_ai_result(uuid, text, text, text, integer, integer, numeric, text) TO service_role;
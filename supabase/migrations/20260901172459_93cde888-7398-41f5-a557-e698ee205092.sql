-- ============ PLANS ============
CREATE TABLE public.plans (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  billing_interval text NOT NULL DEFAULT 'month',
  invoice_limit integer NOT NULL DEFAULT 5,
  processing_limit integer NOT NULL DEFAULT 5,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plans TO anon;
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active plans" ON public.plans
  FOR SELECT TO anon, authenticated USING (is_active);

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.plans (code, name, description, price_cents, currency, billing_interval, invoice_limit, processing_limit, features, sort_order)
VALUES
  ('free', 'Free', 'خطة مجانية للتجربة', 0, 'USD', 'month', 5, 5,
   '["رفع الفواتير","قراءة AI/OCR","تصدير CSV"]'::jsonb, 1),
  ('pro',  'Pro',  'اشتراك شهري كامل',  2500, 'USD', 'month', 1000, 1000,
   '["كل مزايا Free","1000 فاتورة شهريًا","Excel بورقتين","تقرير PDF","حفظ الأرشيف الشهري","المراجعة اليدوية"]'::jsonb, 2);

-- ============ SUBSCRIPTIONS ============
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' REFERENCES public.plans(code),
  status text NOT NULL DEFAULT 'active',
  billing_type text NOT NULL DEFAULT 'free',
  payment_provider text,
  provider_subscription_id text,
  subscription_start timestamptz NOT NULL DEFAULT now(),
  subscription_end timestamptz,
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_status_chk CHECK (status IN ('active','inactive','expired','cancelled')),
  CONSTRAINT subscriptions_billing_type_chk CHECK (billing_type IN ('free','paid','admin_grant')),
  CONSTRAINT subscriptions_provider_chk CHECK (payment_provider IS NULL OR payment_provider IN ('paytr','paddle','stripe','admin'))
);

CREATE INDEX subscriptions_user_idx ON public.subscriptions (user_id, created_at DESC);
CREATE UNIQUE INDEX subscriptions_provider_sub_uidx
  ON public.subscriptions (payment_provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PAYMENT EVENTS (idempotency) ============
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text,
  status text NOT NULL DEFAULT 'received',
  user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
-- no anon/authenticated grants: server-only table

-- ============ PROFILES: subscription mirror columns ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS subscription_id uuid,
  ADD COLUMN IF NOT EXISTS provider_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_start timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_end timestamptz;

-- ============ AUDIT LOG: subscription fields ============
ALTER TABLE public.admin_audit_logs
  ADD COLUMN IF NOT EXISTS old_plan text,
  ADD COLUMN IF NOT EXISTS new_plan text,
  ADD COLUMN IF NOT EXISTS old_status text,
  ADD COLUMN IF NOT EXISTS new_status text,
  ADD COLUMN IF NOT EXISTS duration_days integer,
  ADD COLUMN IF NOT EXISTS reason text;

-- ============ Harden profile privilege protection ============
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('role', true) = 'authenticated' THEN
    NEW.plan := OLD.plan;
    NEW.status := OLD.status;
    NEW.monthly_invoice_limit := OLD.monthly_invoice_limit;
    NEW.monthly_invoice_usage := OLD.monthly_invoice_usage;
    NEW.subscription_status := OLD.subscription_status;
    NEW.billing_type := OLD.billing_type;
    NEW.payment_provider := OLD.payment_provider;
    NEW.subscription_id := OLD.subscription_id;
    NEW.provider_subscription_id := OLD.provider_subscription_id;
    NEW.subscription_start := OLD.subscription_start;
    NEW.subscription_end := OLD.subscription_end;
    NEW.current_period_start := OLD.current_period_start;
    NEW.current_period_end := OLD.current_period_end;
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ============ Sync helper: subscription -> profile mirror ============
CREATE OR REPLACE FUNCTION public.sync_profile_subscription(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.subscriptions;
  lim integer;
BEGIN
  -- expire anything past its end date
  UPDATE public.subscriptions
     SET status = 'expired'
   WHERE user_id = _user_id
     AND status = 'active'
     AND subscription_end IS NOT NULL
     AND subscription_end <= now();

  SELECT * INTO s
    FROM public.subscriptions
   WHERE user_id = _user_id AND status = 'active'
   ORDER BY created_at DESC
   LIMIT 1;

  IF s.id IS NULL THEN
    SELECT invoice_limit INTO lim FROM public.plans WHERE code = 'free';
    UPDATE public.profiles
       SET plan = 'free',
           subscription_status = CASE
             WHEN EXISTS (SELECT 1 FROM public.subscriptions
                           WHERE user_id = _user_id AND status = 'expired')
             THEN 'expired' ELSE 'inactive' END,
           billing_type = 'free',
           payment_provider = NULL,
           subscription_id = NULL,
           provider_subscription_id = NULL,
           subscription_start = NULL,
           subscription_end = NULL,
           current_period_start = NULL,
           current_period_end = NULL,
           monthly_invoice_limit = COALESCE(lim, 5)
     WHERE id = _user_id;
  ELSE
    SELECT invoice_limit INTO lim FROM public.plans WHERE code = s.plan;
    UPDATE public.profiles
       SET plan = s.plan,
           subscription_status = s.status,
           billing_type = s.billing_type,
           payment_provider = s.payment_provider,
           subscription_id = s.id,
           provider_subscription_id = s.provider_subscription_id,
           subscription_start = s.subscription_start,
           subscription_end = s.subscription_end,
           current_period_start = s.subscription_start,
           current_period_end = s.subscription_end,
           monthly_invoice_limit = COALESCE(lim, 5)
     WHERE id = _user_id;
  END IF;
END;
$$;

-- ============ ensure_profile: plan limits from DB + auto expiry ============
CREATE OR REPLACE FUNCTION public.ensure_profile(_user_id uuid, _email text DEFAULT NULL::text)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p public.profiles;
  cur_month text := to_char(now(), 'YYYY-MM');
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (_user_id, _email)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
     SET monthly_invoice_usage = 0,
         usage_month = cur_month
   WHERE id = _user_id AND usage_month <> cur_month;

  PERFORM public.sync_profile_subscription(_user_id);

  SELECT * INTO p FROM public.profiles WHERE id = _user_id;
  RETURN p;
END;
$$;

-- ============ Admin-side subscription mutations (service_role only) ============
CREATE OR REPLACE FUNCTION public.apply_subscription(
  _user_id uuid,
  _plan text,
  _status text,
  _billing_type text,
  _payment_provider text,
  _provider_subscription_id text,
  _start timestamptz,
  _end timestamptz,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.subscriptions;
BEGIN
  UPDATE public.subscriptions
     SET status = 'cancelled', cancelled_at = now()
   WHERE user_id = _user_id AND status = 'active';

  INSERT INTO public.subscriptions
    (user_id, plan, status, billing_type, payment_provider, provider_subscription_id,
     subscription_start, subscription_end, metadata)
  VALUES
    (_user_id, _plan, _status, _billing_type, _payment_provider, _provider_subscription_id,
     COALESCE(_start, now()), _end, COALESCE(_metadata, '{}'::jsonb))
  RETURNING * INTO s;

  PERFORM public.sync_profile_subscription(_user_id);
  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_subscription(_user_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.subscriptions
     SET status = 'cancelled',
         cancelled_at = now(),
         metadata = metadata || jsonb_build_object('revoke_reason', _reason)
   WHERE user_id = _user_id AND status = 'active';

  PERFORM public.sync_profile_subscription(_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_due_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  u uuid;
  n integer := 0;
BEGIN
  FOR u IN
    SELECT DISTINCT user_id FROM public.subscriptions
     WHERE status = 'active' AND subscription_end IS NOT NULL AND subscription_end <= now()
  LOOP
    PERFORM public.sync_profile_subscription(u);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- keep privileged functions off the public API
REVOKE EXECUTE ON FUNCTION public.sync_profile_subscription(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_subscription(uuid, text, text, text, text, text, timestamptz, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_subscription(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_due_subscriptions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_profile(uuid, text) FROM PUBLIC, anon, authenticated;

-- ============ Backfill: existing pro profiles get a subscription row ============
INSERT INTO public.subscriptions (user_id, plan, status, billing_type, payment_provider, subscription_start, subscription_end)
SELECT id, 'pro', 'active', 'admin_grant', 'admin', COALESCE(current_period_start, now()), current_period_end
  FROM public.profiles
 WHERE plan = 'pro';
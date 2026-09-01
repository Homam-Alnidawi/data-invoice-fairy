-- ===== profiles =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  plan text NOT NULL DEFAULT 'free',
  subscription_status text NOT NULL DEFAULT 'inactive',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  monthly_invoice_limit integer NOT NULL DEFAULT 5,
  monthly_invoice_usage integer NOT NULL DEFAULT 0,
  usage_month text NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== guest usage (server-only) =====
CREATE TABLE public.guest_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.guest_usage TO service_role;

ALTER TABLE public.guest_usage ENABLE ROW LEVEL SECURITY;
-- no policies: only the service role (server) may touch this table

CREATE TRIGGER update_guest_usage_updated_at
BEFORE UPDATE ON public.guest_usage
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== invoices: monthly archive support =====
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS archive_month text NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  ADD COLUMN IF NOT EXISTS file_path text;

CREATE INDEX IF NOT EXISTS invoices_user_month_idx
  ON public.invoices (user_id, archive_month, created_at DESC);

-- ===== ensure a profile exists for the current user =====
CREATE OR REPLACE FUNCTION public.ensure_profile(_user_id uuid, _email text DEFAULT NULL)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles;
  cur_month text := to_char(now(), 'YYYY-MM');
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (_user_id, _email)
  ON CONFLICT (id) DO NOTHING;

  -- monthly reset happens server-side
  UPDATE public.profiles
     SET monthly_invoice_usage = 0,
         usage_month = cur_month
   WHERE id = _user_id AND usage_month <> cur_month;

  -- keep limits consistent with the plan
  UPDATE public.profiles
     SET monthly_invoice_limit = CASE WHEN plan = 'pro' THEN 1000 ELSE 5 END
   WHERE id = _user_id
     AND monthly_invoice_limit <> CASE WHEN plan = 'pro' THEN 1000 ELSE 5 END;

  SELECT * INTO p FROM public.profiles WHERE id = _user_id;
  RETURN p;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_profile(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_profile(uuid, text) TO service_role;

-- ===== consume one invoice from the user's monthly quota =====
CREATE OR REPLACE FUNCTION public.consume_invoice_quota(_user_id uuid, _email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles;
BEGIN
  p := public.ensure_profile(_user_id, _email);

  IF p.monthly_invoice_usage >= p.monthly_invoice_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'plan', p.plan,
      'used', p.monthly_invoice_usage,
      'limit', p.monthly_invoice_limit
    );
  END IF;

  UPDATE public.profiles
     SET monthly_invoice_usage = monthly_invoice_usage + 1
   WHERE id = _user_id
   RETURNING * INTO p;

  RETURN jsonb_build_object(
    'allowed', true,
    'plan', p.plan,
    'used', p.monthly_invoice_usage,
    'limit', p.monthly_invoice_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_invoice_quota(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.consume_invoice_quota(uuid, text) TO service_role;

-- ===== refund a quota unit when processing fails before AI ran =====
CREATE OR REPLACE FUNCTION public.refund_invoice_quota(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET monthly_invoice_usage = GREATEST(0, monthly_invoice_usage - 1)
   WHERE id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_invoice_quota(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.refund_invoice_quota(uuid) TO service_role;

-- ===== guest quota (2 free invoices, tracked server-side) =====
CREATE OR REPLACE FUNCTION public.consume_guest_quota(_fingerprint text, _limit integer DEFAULT 2)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.guest_usage;
BEGIN
  INSERT INTO public.guest_usage (fingerprint, used)
  VALUES (_fingerprint, 0)
  ON CONFLICT (fingerprint) DO NOTHING;

  SELECT * INTO g FROM public.guest_usage WHERE fingerprint = _fingerprint;

  IF g.used >= _limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', g.used, 'limit', _limit);
  END IF;

  UPDATE public.guest_usage
     SET used = used + 1
   WHERE fingerprint = _fingerprint
   RETURNING * INTO g;

  RETURN jsonb_build_object('allowed', true, 'used', g.used, 'limit', _limit);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_guest_quota(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.consume_guest_quota(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_guest_quota(_fingerprint text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.guest_usage
     SET used = GREATEST(0, used - 1)
   WHERE fingerprint = _fingerprint;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_guest_quota(text) FROM public;
GRANT EXECUTE ON FUNCTION public.refund_guest_quota(text) TO service_role;
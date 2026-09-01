-- 1) Payment transactions -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  environment text NOT NULL,
  plan text NOT NULL DEFAULT 'pro',
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  merchant_oid text NOT NULL,
  provider_reference text,
  checkout_url text,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamp with time zone,
  subscription_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_merchant_oid_key
  ON public.payment_transactions (merchant_oid);
CREATE INDEX IF NOT EXISTS payment_transactions_user_idx
  ON public.payment_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_provider_ref_idx
  ON public.payment_transactions (provider, provider_reference);

GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own payment transactions"
  ON public.payment_transactions FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_payment_transactions_updated_at ON public.payment_transactions;
CREATE TRIGGER update_payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Per-environment connection test results (no secrets stored here) ------
ALTER TABLE public.payment_provider_settings
  ADD COLUMN IF NOT EXISTS test_results jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3) Subscription lifecycle -------------------------------------------------
-- Entitled statuses keep Pro active; past_due/trialing must not drop access.
CREATE OR REPLACE FUNCTION public.sync_profile_subscription(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.subscriptions;
  lim integer;
BEGIN
  UPDATE public.subscriptions
     SET status = 'expired'
   WHERE user_id = _user_id
     AND status IN ('active','trialing','past_due','paused')
     AND subscription_end IS NOT NULL
     AND subscription_end <= now();

  SELECT * INTO s
    FROM public.subscriptions
   WHERE user_id = _user_id AND status IN ('active','trialing','past_due')
   ORDER BY created_at DESC
   LIMIT 1;

  IF s.id IS NULL THEN
    SELECT invoice_limit INTO lim FROM public.plans WHERE code = 'free';
    UPDATE public.profiles
       SET plan = 'free',
           subscription_status = COALESCE((
             SELECT status FROM public.subscriptions
              WHERE user_id = _user_id
              ORDER BY updated_at DESC LIMIT 1
           ), 'inactive'),
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
$function$;

-- apply_subscription must not cancel non-active lifecycle rows silently
CREATE OR REPLACE FUNCTION public.apply_subscription(_user_id uuid, _plan text, _status text, _billing_type text, _payment_provider text, _provider_subscription_id text, _start timestamp with time zone, _end timestamp with time zone, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS subscriptions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.subscriptions;
BEGIN
  UPDATE public.subscriptions
     SET status = 'cancelled', cancelled_at = now()
   WHERE user_id = _user_id AND status IN ('active','trialing','past_due','paused');

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
$function$;

-- Update the lifecycle status of the user's current subscription
CREATE OR REPLACE FUNCTION public.set_subscription_status(_user_id uuid, _status text, _reason text DEFAULT NULL, _end timestamp with time zone DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target uuid;
BEGIN
  IF _status NOT IN ('active','trialing','past_due','paused','cancelled','expired','refunded') THEN
    RAISE EXCEPTION 'invalid subscription status';
  END IF;

  SELECT id INTO target
    FROM public.subscriptions
   WHERE user_id = _user_id
     AND status IN ('active','trialing','past_due','paused')
   ORDER BY created_at DESC
   LIMIT 1;

  IF target IS NULL THEN
    PERFORM public.sync_profile_subscription(_user_id);
    RETURN;
  END IF;

  UPDATE public.subscriptions
     SET status = _status,
         subscription_end = COALESCE(_end, subscription_end),
         cancelled_at = CASE WHEN _status IN ('cancelled','refunded') THEN now() ELSE cancelled_at END,
         metadata = metadata || jsonb_build_object('lifecycle_reason', _reason)
   WHERE id = target;

  PERFORM public.sync_profile_subscription(_user_id);
END;
$function$;
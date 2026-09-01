CREATE OR REPLACE FUNCTION public.apply_subscription(_user_id uuid, _plan text, _status text, _billing_type text, _payment_provider text, _provider_subscription_id text, _start timestamp with time zone, _end timestamp with time zone, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS subscriptions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.subscriptions;
  existing_id uuid;
BEGIN
  IF _payment_provider IS NOT NULL AND _provider_subscription_id IS NOT NULL THEN
    SELECT id INTO existing_id
      FROM public.subscriptions
     WHERE payment_provider = _payment_provider
       AND provider_subscription_id = _provider_subscription_id
     LIMIT 1;
  END IF;

  UPDATE public.subscriptions
     SET status = 'cancelled', cancelled_at = now()
   WHERE user_id = _user_id
     AND status IN ('active','trialing','past_due','paused')
     AND (existing_id IS NULL OR id <> existing_id);

  IF existing_id IS NOT NULL THEN
    UPDATE public.subscriptions
       SET user_id = _user_id,
           plan = _plan,
           status = _status,
           billing_type = _billing_type,
           subscription_start = COALESCE(_start, now()),
           subscription_end = _end,
           cancelled_at = NULL,
           metadata = metadata || COALESCE(_metadata, '{}'::jsonb)
     WHERE id = existing_id
     RETURNING * INTO s;
  ELSE
    INSERT INTO public.subscriptions
      (user_id, plan, status, billing_type, payment_provider, provider_subscription_id,
       subscription_start, subscription_end, metadata)
    VALUES
      (_user_id, _plan, _status, _billing_type, _payment_provider, _provider_subscription_id,
       COALESCE(_start, now()), _end, COALESCE(_metadata, '{}'::jsonb))
    RETURNING * INTO s;
  END IF;

  PERFORM public.sync_profile_subscription(_user_id);
  RETURN s;
END;
$function$;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_chk;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_chk
  CHECK (status IN ('active','trialing','past_due','paused','cancelled','expired','refunded'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_status_chk;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_subscription_status_chk
  CHECK (subscription_status IN ('inactive','active','trialing','past_due','paused','cancelled','expired','refunded'));
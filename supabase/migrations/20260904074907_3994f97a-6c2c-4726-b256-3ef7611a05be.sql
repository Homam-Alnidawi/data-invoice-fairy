ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_type_chk;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_billing_type_chk
  CHECK (billing_type = ANY (ARRAY['free','paid','admin_grant','manual']));

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_provider_chk;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_provider_chk
  CHECK (payment_provider IS NULL OR payment_provider = ANY (ARRAY['paytr','paddle','stripe','admin','zaincash','paypal_manual','zaincash_manual','card_manual']));
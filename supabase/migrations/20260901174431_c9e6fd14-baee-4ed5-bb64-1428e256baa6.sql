CREATE TABLE public.payment_provider_settings (
  provider text PRIMARY KEY,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'test',
  currency text NOT NULL DEFAULT 'USD',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'not_configured',
  last_error text,
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.payment_provider_settings TO service_role;
ALTER TABLE public.payment_provider_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read payment provider settings"
  ON public.payment_provider_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_payment_provider_settings_updated_at
BEFORE UPDATE ON public.payment_provider_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.payment_provider_secrets (
  provider text NOT NULL,
  environment text NOT NULL,
  key text NOT NULL,
  value_encrypted text NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, environment, key)
);

GRANT ALL ON public.payment_provider_secrets TO service_role;
ALTER TABLE public.payment_provider_secrets ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_payment_provider_secrets_updated_at
BEFORE UPDATE ON public.payment_provider_secrets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
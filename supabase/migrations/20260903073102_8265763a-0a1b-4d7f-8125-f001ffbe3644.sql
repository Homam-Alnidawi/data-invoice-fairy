CREATE TABLE public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id text NOT NULL,
  plan_name text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL,
  payment_method text NOT NULL,
  transaction_id text,
  payment_proof text,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT payment_requests_amount_check CHECK (amount >= 0)
);

GRANT SELECT, INSERT ON public.payment_requests TO authenticated;
GRANT ALL ON public.payment_requests TO service_role;

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payment requests"
  ON public.payment_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can submit their own payment requests"
  ON public.payment_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE TRIGGER update_payment_requests_updated_at
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX payment_requests_user_idx
  ON public.payment_requests (user_id, submitted_at DESC);

CREATE INDEX payment_requests_status_idx
  ON public.payment_requests (status, submitted_at DESC);
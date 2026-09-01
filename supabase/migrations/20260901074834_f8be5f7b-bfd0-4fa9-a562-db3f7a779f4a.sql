REVOKE EXECUTE ON FUNCTION public.ensure_profile(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_invoice_quota(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_invoice_quota(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_guest_quota(text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_guest_quota(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
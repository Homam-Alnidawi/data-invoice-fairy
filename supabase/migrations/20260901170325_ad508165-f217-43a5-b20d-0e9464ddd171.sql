REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.protect_profile_privileges() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.bump_usage(uuid, integer, integer, integer, integer, integer, integer) FROM public;

REVOKE EXECUTE ON FUNCTION public.ensure_profile(uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.consume_invoice_quota(uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.refund_invoice_quota(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.consume_guest_quota(text, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.refund_guest_quota(text) FROM anon, authenticated, public;
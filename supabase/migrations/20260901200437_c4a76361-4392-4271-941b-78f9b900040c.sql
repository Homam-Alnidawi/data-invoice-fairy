DROP FUNCTION IF EXISTS public.get_public_settings();

REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_ai_result(uuid, text, text, text, integer, integer, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_ai_result(uuid, text, text, text, integer, integer, numeric, text) TO service_role;
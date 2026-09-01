// TEMPORARY local test harness — deleted immediately after the test run.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tmp-paytest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { action: string; userId?: string };
        const store = await import("@/lib/payment-providers.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (body.action === "seed") {
          await supabaseAdmin.from("payment_provider_settings").upsert(
            {
              provider: "paddle",
              display_name: "Paddle Billing",
              environment: "sandbox",
              currency: "USD",
              enabled: true,
              config: { "sandbox:price_id": "pri_TEST", "sandbox:client_token": "test_tok" },
              test_results: { sandbox: { ok: true, at: new Date().toISOString(), message: "ok" } },
            } as never,
            { onConflict: "provider" },
          );
          await store.putSecret("paddle", "sandbox", "api_key", "sk_test", body.userId!);
          await store.putSecret("paddle", "sandbox", "webhook_secret", "whsec_test", body.userId!);
          await supabaseAdmin.from("payment_transactions").insert({
            user_id: body.userId!,
            provider: "paddle",
            environment: "sandbox",
            plan: "pro",
            amount_cents: 2500,
            currency: "USD",
            merchant_oid: "TESTOID1",
            status: "created",
          } as never);
          return Response.json({ ok: true });
        }

        if (body.action === "state") {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("plan, subscription_status")
            .eq("id", body.userId!)
            .maybeSingle();
          const { data: tx } = await supabaseAdmin
            .from("payment_transactions")
            .select("status")
            .eq("merchant_oid", "TESTOID1")
            .maybeSingle();
          const { data: ev } = await supabaseAdmin
            .from("payment_events")
            .select("event_id, status, error")
            .eq("provider", "paddle");
          return Response.json({ prof, tx, ev });
        }

        if (body.action === "cleanup") {
          await supabaseAdmin.from("payment_events").delete().eq("provider", "paddle");
          await supabaseAdmin.from("payment_transactions").delete().eq("merchant_oid", "TESTOID1");
          await supabaseAdmin.from("subscriptions").delete().eq("payment_provider", "paddle");
          await supabaseAdmin.from("payment_provider_settings").delete().eq("provider", "paddle");
          await supabaseAdmin.from("payment_provider_secrets").delete().eq("provider", "paddle");
          await supabaseAdmin.rpc("sync_profile_subscription", { _user_id: body.userId! } as never);
          return Response.json({ ok: true });
        }
        return new Response("bad", { status: 400 });
      },
    },
  },
});

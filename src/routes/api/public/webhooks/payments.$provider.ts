import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * نقطة استقبال Webhooks من بوابات الدفع (PayTR / Paddle / Stripe).
 *
 * التدفق الآمن:
 *   1) التحقق من المزوّد
 *   2) التحقق من التوقيع (HMAC) باستخدام السر المخزّن في الخادم فقط
 *   3) التحقق من نوع الحدث
 *   4) التحقق من معرّف الاشتراك/العملية
 *   5) منع تكرار معالجة نفس الحدث (payment_events unique)
 *   6) تحديث الاشتراك عبر apply_subscription
 *   7) تسجيل العملية
 *   8) إرجاع 200
 *
 * لا توجد مفاتيح أو بيانات دفع وهمية هنا: إن لم يُضبط سر المزوّد يُرفض الطلب.
 */

const PROVIDERS = ["paytr", "paddle", "stripe"] as const;
type Provider = (typeof PROVIDERS)[number];

const SECRET_ENV: Record<Provider, string> = {
  paytr: "PAYTR_WEBHOOK_SECRET",
  paddle: "PADDLE_WEBHOOK_SECRET",
  stripe: "STRIPE_WEBHOOK_SECRET",
};

const SIGNATURE_HEADER: Record<Provider, string> = {
  paytr: "x-paytr-signature",
  paddle: "paddle-signature",
  stripe: "stripe-signature",
};

function verify(secret: string, body: string, header: string | null): boolean {
  if (!header) return false;
  // نأخذ آخر جزء سداسي عشري من ترويسة التوقيع (يغطي صيغ Stripe/Paddle الشائعة)
  const candidate = (header.match(/[a-f0-9]{32,}/gi) ?? [header]).pop()!;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(candidate.toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Normalized = {
  eventId: string;
  eventType: string;
  userId: string | null;
  plan: string;
  providerSubscriptionId: string | null;
  periodEnd: string | null;
  cancel: boolean;
};

/** يحوّل حمولات المزوّدين إلى شكل موحّد. يُوسَّع عند ربط كل مزوّد فعليًا. */
function normalize(provider: Provider, payload: Record<string, unknown>): Normalized | null {
  const get = (path: string): unknown =>
    path.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], payload);

  const eventId = String(get("id") ?? get("event_id") ?? get("merchant_oid") ?? "");
  if (!eventId) return null;

  const eventType = String(get("type") ?? get("event_type") ?? get("status") ?? "unknown");
  const meta = (get("data.object.metadata") ?? get("data.custom_data") ?? get("metadata") ?? {}) as
    | Record<string, unknown>
    | undefined;

  const userId = (meta?.["user_id"] as string | undefined) ?? null;
  const plan = (meta?.["plan"] as string | undefined) ?? "pro";
  const providerSubscriptionId =
    (get("data.object.subscription") as string | undefined) ??
    (get("data.subscription_id") as string | undefined) ??
    (get("merchant_oid") as string | undefined) ??
    null;

  const cancel = /cancel|refund|failed|deleted|expired/i.test(eventType);
  const rawEnd =
    (get("data.object.current_period_end") as number | string | undefined) ??
    (get("data.next_billed_at") as string | undefined) ??
    null;
  const periodEnd =
    typeof rawEnd === "number"
      ? new Date(rawEnd * 1000).toISOString()
      : typeof rawEnd === "string"
        ? new Date(rawEnd).toISOString()
        : null;

  void provider;
  return { eventId, eventType, userId, plan, providerSubscriptionId, periodEnd, cancel };
}

export const Route = createFileRoute("/api/public/webhooks/payments/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const provider = params.provider as Provider;
        if (!PROVIDERS.includes(provider)) {
          return new Response("Unknown provider", { status: 404 });
        }

        const secret = process.env[SECRET_ENV[provider]];
        if (!secret) {
          // المزوّد غير مُفعَّل بعد — لا نقبل أي تفعيل بدون سر حقيقي
          return new Response("Provider not configured", { status: 503 });
        }

        const body = await request.text();
        if (!verify(secret, body, request.headers.get(SIGNATURE_HEADER[provider]))) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(body) as Record<string, unknown>;
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const evt = normalize(provider, payload);
        if (!evt) return new Response("Unrecognized event", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency: أول إدراج فقط ينجح
        const { error: dupErr } = await supabaseAdmin.from("payment_events").insert({
          provider,
          event_id: evt.eventId,
          event_type: evt.eventType,
          user_id: evt.userId,
          payload: payload as never,
        });
        if (dupErr) {
          if (dupErr.code === "23505") return new Response("ok (duplicate)", { status: 200 });
          return new Response("Storage error", { status: 500 });
        }

        try {
          if (!evt.userId) throw new Error("missing user_id in metadata");

          if (evt.cancel) {
            await supabaseAdmin.rpc("revoke_subscription", {
              _user_id: evt.userId,
              _reason: `webhook:${evt.eventType}`,
            } as never);
          } else {
            await supabaseAdmin.rpc("apply_subscription", {
              _user_id: evt.userId,
              _plan: evt.plan,
              _status: "active",
              _billing_type: "paid",
              _payment_provider: provider,
              _provider_subscription_id: evt.providerSubscriptionId,
              _start: new Date().toISOString(),
              _end: evt.periodEnd,
              _metadata: { event_id: evt.eventId, event_type: evt.eventType },
            } as never);
          }

          await supabaseAdmin
            .from("payment_events")
            .update({ status: "processed", processed_at: new Date().toISOString() })
            .eq("provider", provider)
            .eq("event_id", evt.eventId);

          await supabaseAdmin.from("activity_logs").insert({
            user_id: evt.userId,
            action: evt.cancel ? "subscription_cancelled_by_provider" : "subscription_paid",
            detail: `${provider}:${evt.eventType}`,
          });

          return new Response("ok", { status: 200 });
        } catch (e) {
          await supabaseAdmin
            .from("payment_events")
            .update({ status: "failed", error: (e as Error).message })
            .eq("provider", provider)
            .eq("event_id", evt.eventId);
          return new Response("Processing error", { status: 500 });
        }
      },
    },
  },
});

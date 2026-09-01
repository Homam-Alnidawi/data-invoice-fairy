import { createFileRoute } from "@tanstack/react-router";

/**
 * استقبال إشعارات الدفع (Webhook / Callback) من بوابات الدفع.
 *
 * الأسرار تُقرأ من مخزن الأسرار المشفّر (Admin → Settings → Payment Providers)
 * ولا توجد أي بيانات اعتماد داخل الكود. إن لم يكن المزوّد مُعدًّا ومفعّلًا
 * يُرفض الطلب. لا تُسجَّل أي قيمة سرّية في أي مكان.
 */

const PROVIDERS = ["paytr", "paddle", "zaincash"] as const;
type Provider = (typeof PROVIDERS)[number];

async function hmacHex(key: string, message: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacBase64(key: string, message: string) {
  const hex = await hmacHex(key, message);
  const bytes = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
  return btoa(String.fromCharCode(...bytes));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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

export const Route = createFileRoute("/api/public/webhooks/payments/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const provider = params.provider as Provider;
        if (!PROVIDERS.includes(provider)) return new Response("Unknown provider", { status: 404 });

        const store = await import("@/lib/payment-providers.server");
        const def = store.getProviderDef(provider)!;
        const row = await store.readSettings(provider);
        if (!row?.enabled) return new Response("Provider not configured", { status: 503 });
        const environment = row.environment ?? def.environments[0]!.value;

        const body = await request.text();
        let evt: Normalized | null = null;
        let rawPayload: Record<string, unknown> = {};

        /* ---------------- PayTR callback ---------------- */
        if (provider === "paytr") {
          const key = await store.getSecret(provider, environment, "merchant_key");
          const salt = await store.getSecret(provider, environment, "merchant_salt");
          if (!key || !salt) return new Response("Provider not configured", { status: 503 });

          const form = new URLSearchParams(body);
          const oid = form.get("merchant_oid") ?? "";
          const status = form.get("status") ?? "";
          const total = form.get("total_amount") ?? "";
          const hash = form.get("hash") ?? "";
          const expected = await hmacBase64(key, `${oid}${salt}${status}${total}`);
          if (!oid || !safeEqual(hash, expected)) {
            return new Response("PAYTR notification failed: bad hash", { status: 401 });
          }
          rawPayload = Object.fromEntries(form.entries());
          const meta = String(form.get("merchant_oid") ?? "");
          evt = {
            eventId: oid,
            eventType: `paytr.${status}`,
            // نمرّر user_id داخل merchant_oid بصيغة: <uuid-بلا-شرطات><طابع زمني>
            userId: decodeUserFromOid(meta),
            plan: "pro",
            providerSubscriptionId: oid,
            periodEnd: monthFromNow(),
            cancel: status !== "success",
          };
        }

        /* ---------------- Paddle webhook ---------------- */
        if (provider === "paddle") {
          const secret = await store.getSecret(provider, environment, "webhook_secret");
          if (!secret) return new Response("Provider not configured", { status: 503 });
          const header = request.headers.get("paddle-signature") ?? "";
          const ts = /ts=([^;]+)/.exec(header)?.[1];
          const h1 = /h1=([^;]+)/.exec(header)?.[1];
          if (!ts || !h1) return new Response("Invalid signature", { status: 401 });
          const expected = await hmacHex(secret, `${ts}:${body}`);
          if (!safeEqual(h1.toLowerCase(), expected)) {
            return new Response("Invalid signature", { status: 401 });
          }
          const payload = JSON.parse(body) as Record<string, unknown>;
          rawPayload = payload;
          const d = (payload["data"] ?? {}) as Record<string, unknown>;
          const custom = (d["custom_data"] ?? {}) as Record<string, unknown>;
          const type = String(payload["event_type"] ?? "unknown");
          evt = {
            eventId: String(payload["event_id"] ?? ""),
            eventType: type,
            userId: (custom["user_id"] as string | undefined) ?? null,
            plan: (custom["plan"] as string | undefined) ?? "pro",
            providerSubscriptionId: (d["id"] as string | undefined) ?? null,
            periodEnd: d["next_billed_at"]
              ? new Date(String(d["next_billed_at"])).toISOString()
              : monthFromNow(),
            cancel: /cancel|paused|past_due|expired/i.test(type),
          };
        }

        /* ---------------- Zain Cash callback ---------------- */
        if (provider === "zaincash") {
          const secret = await store.getSecret(provider, environment, "api_secret");
          if (!secret) return new Response("Provider not configured", { status: 503 });
          const url = new URL(request.url);
          const token =
            url.searchParams.get("token") ?? new URLSearchParams(body).get("token") ?? "";
          const parts = token.split(".");
          if (parts.length !== 3) return new Response("Invalid token", { status: 401 });
          const expected = (await hmacBase64(secret, `${parts[0]}.${parts[1]}`))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
          if (!safeEqual(parts[2]!, expected)) {
            return new Response("Invalid token", { status: 401 });
          }
          const claims = JSON.parse(
            atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")),
          ) as Record<string, unknown>;
          rawPayload = claims;
          const status = String(claims["status"] ?? "");
          evt = {
            eventId: String(claims["id"] ?? ""),
            eventType: `zaincash.${status}`,
            userId: (claims["orderid"] as string | undefined)
              ? decodeUserFromOid(String(claims["orderid"]))
              : null,
            plan: "pro",
            providerSubscriptionId: String(claims["id"] ?? ""),
            // Zain Cash لا يدعم التجديد التلقائي — دورة واحدة فقط
            periodEnd: monthFromNow(),
            cancel: status !== "success" && status !== "completed",
          };
        }

        if (!evt || !evt.eventId) return new Response("Unrecognized event", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { error: dupErr } = await supabaseAdmin.from("payment_events").insert({
          provider,
          event_id: evt.eventId,
          event_type: evt.eventType,
          user_id: evt.userId,
          payload: rawPayload as never,
        });
        if (dupErr) {
          if (dupErr.code === "23505") return new Response("OK", { status: 200 });
          return new Response("Storage error", { status: 500 });
        }

        try {
          if (!evt.userId) throw new Error("missing user reference");

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
              _metadata: { event_id: evt.eventId, event_type: evt.eventType, environment },
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

          return new Response("OK", { status: 200 });
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

/** معرّف الطلب يحمل معرّف المستخدم: 32 حرفًا hex ثم طابع زمني. */
function decodeUserFromOid(oid: string): string | null {
  const hex = oid.slice(0, 32);
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function monthFromNow() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

import { createFileRoute } from "@tanstack/react-router";

/**
 * استقبال إشعارات الدفع (Webhook / Callback) من بوابات الدفع.
 *
 * ترتيب المعالجة الصارم:
 *   raw body → parse signature → timestamp window → HMAC/JWT (constant-time)
 *   → idempotency → payment transaction lookup → amount/currency/price checks
 *   → subscription lifecycle
 *
 * الأسرار تُقرأ من المخزن المشفّر فقط، ولا تُسجَّل أبدًا.
 * لا يوجد أي نطاق مثبّت هنا — روابط العودة تُبنى من APP_URL / رأس الطلب.
 */

const PROVIDERS = ["paytr", "paddle", "zaincash"] as const;
type Provider = (typeof PROVIDERS)[number];

const PADDLE_TS_WINDOW_SECONDS = 300;

type Tx = {
  id: string;
  user_id: string;
  plan: string;
  amount_cents: number;
  currency: string;
  environment: string;
  status: string;
};

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

/** حالة الاشتراك الناتجة عن الحدث. */
type Lifecycle =
  | "activate"
  | "trialing"
  | "past_due"
  | "paused"
  | "cancelled"
  | "expired"
  | "refunded"
  | "payment_failed"
  | "ignore";

type Normalized = {
  eventId: string;
  eventType: string;
  merchantOid: string | null;
  providerSubscriptionId: string | null;
  periodEnd: string | null;
  lifecycle: Lifecycle;
  /** المبلغ المعلن من المزوّد بالوحدة المخزَّنة نفسها، إن توفّر. */
  amount: number | null;
  currency: string | null;
  /** معرّف السعر/المنتج المدفوع (Paddle). */
  priceIds: string[];
  plan: string;
};

function paddleLifecycle(type: string, payload: Record<string, unknown>): Lifecycle {
  const d = (payload["data"] ?? {}) as Record<string, unknown>;
  const status = String(d["status"] ?? "").toLowerCase();
  switch (type) {
    case "transaction.completed":
    case "transaction.paid":
    case "subscription.activated":
    case "subscription.created":
    case "subscription.resumed":
      return status === "trialing" ? "trialing" : "activate";
    case "subscription.updated":
      if (status === "active") return "activate";
      if (status === "trialing") return "trialing";
      if (status === "past_due") return "past_due";
      if (status === "paused") return "paused";
      if (status === "canceled" || status === "cancelled") return "cancelled";
      return "ignore";
    case "subscription.past_due":
    case "transaction.payment_failed":
      return "past_due";
    case "subscription.paused":
      return "paused";
    case "subscription.canceled":
    case "subscription.cancelled":
      return "cancelled";
    case "transaction.revised":
      return "ignore";
    case "adjustment.created":
    case "adjustment.updated":
      return String(d["action"] ?? "").toLowerCase() === "refund" ? "refunded" : "ignore";
    default:
      return "ignore";
  }
}

export const Route = createFileRoute("/api/public/webhooks/payments/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handle(request, params.provider),
      // بعض المزوّدين (Zain Cash) يعودون بـ GET مع token في الـ query string.
      GET: async ({ request, params }) => handle(request, params.provider),
    },
  },
});

async function handle(request: Request, providerParam: string) {
  const provider = providerParam as Provider;
  if (!PROVIDERS.includes(provider)) return new Response("Unknown provider", { status: 404 });

  const store = await import("@/lib/payment-providers.server");
  const def = store.getProviderDef(provider)!;
  const row = await store.readSettings(provider);
  if (!row?.enabled) return new Response("Provider not configured", { status: 503 });
  const environment = row.environment ?? def.environments[0]!.value;

  // 1) raw body — يُستخدم كما هو في حساب التوقيع
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
    evt = {
      eventId: `${oid}:${status}`,
      eventType: `paytr.${status}`,
      merchantOid: oid,
      providerSubscriptionId: oid,
      periodEnd: monthFromNow(),
      lifecycle: status === "success" ? "activate" : "payment_failed",
      amount: /^\d+$/.test(total) ? Number(total) : null,
      currency: form.get("currency"),
      priceIds: [],
      plan: "pro",
    };
  }

  /* ---------------- Paddle webhook ---------------- */
  if (provider === "paddle") {
    const secret = await store.getSecret(provider, environment, "webhook_secret");
    if (!secret) return new Response("Provider not configured", { status: 503 });

    // 2) parse signature header
    const header = request.headers.get("paddle-signature") ?? "";
    const ts = /ts=([^;]+)/.exec(header)?.[1];
    const h1 = /h1=([^;]+)/.exec(header)?.[1];
    if (!ts || !h1) return new Response("Invalid signature", { status: 401 });

    // 3) replay protection — نافذة 5 دقائق
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) return new Response("Invalid signature", { status: 401 });
    if (Math.abs(Math.floor(Date.now() / 1000) - tsNum) > PADDLE_TS_WINDOW_SECONDS) {
      return new Response("Signature timestamp outside allowed window", { status: 401 });
    }

    // 4) HMAC على الجسم الخام + مقارنة بزمن ثابت
    const expected = await hmacHex(secret, `${ts}:${body}`);
    if (!safeEqual(h1.toLowerCase(), expected)) {
      return new Response("Invalid signature", { status: 401 });
    }

    const payload = JSON.parse(body) as Record<string, unknown>;
    rawPayload = payload;
    const d = (payload["data"] ?? {}) as Record<string, unknown>;
    const custom = (d["custom_data"] ?? {}) as Record<string, unknown>;
    const type = String(payload["event_type"] ?? "unknown");
    const items = Array.isArray(d["items"]) ? (d["items"] as Record<string, unknown>[]) : [];
    const priceIds = items
      .map((it) => {
        const price = (it["price"] ?? {}) as Record<string, unknown>;
        return String(price["id"] ?? it["price_id"] ?? "");
      })
      .filter(Boolean);
    const details = (d["details"] ?? {}) as Record<string, unknown>;
    const totals = (details["totals"] ?? {}) as Record<string, unknown>;
    const grand = totals["grand_total"];

    evt = {
      eventId: String(payload["event_id"] ?? ""),
      eventType: type,
      merchantOid: (custom["merchant_oid"] as string | undefined) ?? null,
      providerSubscriptionId:
        (d["subscription_id"] as string | undefined) ?? (d["id"] as string | undefined) ?? null,
      periodEnd: d["next_billed_at"]
        ? new Date(String(d["next_billed_at"])).toISOString()
        : monthFromNow(),
      lifecycle: paddleLifecycle(type, payload),
      amount: grand !== undefined && /^\d+$/.test(String(grand)) ? Number(grand) : null,
      currency: (d["currency_code"] as string | undefined) ?? null,
      priceIds,
      // custom_data.plan معلومة إضافية فقط — لا تمنح صلاحية بذاتها
      plan: (custom["plan"] as string | undefined) ?? "pro",
    };
  }

  /* ---------------- Zain Cash callback ---------------- */
  if (provider === "zaincash") {
    const secret = await store.getSecret(provider, environment, "api_secret");
    if (!secret) return new Response("Provider not configured", { status: 503 });
    const url = new URL(request.url);
    const token = url.searchParams.get("token") ?? new URLSearchParams(body).get("token") ?? "";
    const parts = token.split(".");
    if (parts.length !== 3) return new Response("Invalid token", { status: 401 });
    const expected = (await hmacBase64(secret, `${parts[0]}.${parts[1]}`))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    if (!safeEqual(parts[2]!, expected)) return new Response("Invalid token", { status: 401 });

    const claims = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as Record<
      string,
      unknown
    >;
    rawPayload = claims;
    const status = String(claims["status"] ?? "").toLowerCase();
    const paid = status === "success" || status === "completed";
    evt = {
      eventId: String(claims["id"] ?? ""),
      eventType: `zaincash.${status}`,
      merchantOid: (claims["orderid"] as string | undefined) ?? null,
      providerSubscriptionId: String(claims["id"] ?? ""),
      // Zain Cash بلا تجديد تلقائي — دورة واحدة فقط
      periodEnd: monthFromNow(),
      lifecycle: paid ? "activate" : "payment_failed",
      amount:
        claims["amount"] !== undefined && /^\d+$/.test(String(claims["amount"]))
          ? Number(claims["amount"])
          : null,
      currency: "IQD",
      priceIds: [],
      plan: "pro",
    };
  }

  if (!evt || !evt.eventId) return new Response("Unrecognized event", { status: 400 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  /* ---------------- 5) Idempotency ---------------- */
  const { error: dupErr } = await supabaseAdmin.from("payment_events").insert({
    provider,
    event_id: evt.eventId,
    event_type: evt.eventType,
    payload: rawPayload as never,
  });
  if (dupErr) {
    // نفس الحدث سبق أن عولج — لا يُعاد تنفيذ أي منطق اشتراك
    if (dupErr.code === "23505") return new Response("OK (duplicate)", { status: 200 });
    return new Response("Storage error", { status: 500 });
  }

  const finish = async (
    status: "processed" | "rejected" | "failed",
    userId: string | null,
    note?: string,
  ) => {
    await supabaseAdmin
      .from("payment_events")
      .update({
        status,
        user_id: userId,
        processed_at: new Date().toISOString(),
        ...(note ? { error: note } : {}),
      })
      .eq("provider", provider)
      .eq("event_id", evt!.eventId);
  };

  try {
    /* -------- 6) ربط الحدث بعملية دفع مسجَّلة على الخادم -------- */
    let tx: Tx | null = null;

    if (evt.merchantOid) {
      const { data } = await supabaseAdmin
        .from("payment_transactions")
        .select("id, user_id, plan, amount_cents, currency, environment, status")
        .eq("merchant_oid", evt.merchantOid)
        .maybeSingle();
      tx = (data as unknown as Tx | null) ?? null;
    }
    if (!tx && evt.providerSubscriptionId) {
      const { data } = await supabaseAdmin
        .from("payment_transactions")
        .select("id, user_id, plan, amount_cents, currency, environment, status")
        .eq("provider", provider)
        .eq("provider_reference", evt.providerSubscriptionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      tx = (data as unknown as Tx | null) ?? null;
    }
    // اشتراك متكرّر: الأحداث اللاحقة تُربط عبر الاشتراك المخزَّن
    let userId = tx?.user_id ?? null;
    if (!userId && evt.providerSubscriptionId) {
      const { data } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id")
        .eq("payment_provider", provider)
        .eq("provider_subscription_id", evt.providerSubscriptionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      userId = (data as { user_id: string } | null)?.user_id ?? null;
    }

    if (!userId) {
      await finish("rejected", null, "unknown transaction reference");
      return new Response("OK (unmatched)", { status: 200 });
    }

    /* -------- 7) دورة حياة الاشتراك -------- */
    if (evt.lifecycle === "ignore") {
      await finish("processed", userId, "no-op event");
      return new Response("OK", { status: 200 });
    }

    if (evt.lifecycle === "activate" || evt.lifecycle === "trialing") {
      // التحقق من المنتج/السعر المُهيّأ (Paddle)
      if (provider === "paddle") {
        const configuredPrice = store.cfgValue(row, environment, "price_id");
        if (!configuredPrice || !evt.priceIds.includes(configuredPrice)) {
          await finish("rejected", userId, "price_id mismatch — Pro not granted");
          if (tx) {
            await supabaseAdmin
              .from("payment_transactions")
              .update({ status: "rejected" })
              .eq("id", tx.id);
          }
          return new Response("OK (price mismatch)", { status: 200 });
        }
      }

      // التحقق من المبلغ والعملة مقابل العملية المسجَّلة
      if (tx) {
        if (evt.amount !== null && evt.amount !== tx.amount_cents) {
          await finish("rejected", userId, "amount mismatch — Pro not granted");
          await supabaseAdmin
            .from("payment_transactions")
            .update({ status: "rejected" })
            .eq("id", tx.id);
          return new Response("OK (amount mismatch)", { status: 200 });
        }
        if (
          evt.currency &&
          tx.currency &&
          evt.currency.toUpperCase() !== tx.currency.toUpperCase()
        ) {
          await finish("rejected", userId, "currency mismatch — Pro not granted");
          await supabaseAdmin
            .from("payment_transactions")
            .update({ status: "rejected" })
            .eq("id", tx.id);
          return new Response("OK (currency mismatch)", { status: 200 });
        }
        if (tx.environment !== environment) {
          await finish("rejected", userId, "environment mismatch — Pro not granted");
          return new Response("OK (environment mismatch)", { status: 200 });
        }
      }

      const { data: sub, error: applyErr } = await supabaseAdmin.rpc("apply_subscription", {
        _user_id: userId,
        _plan: tx?.plan ?? evt.plan,
        _status: evt.lifecycle === "trialing" ? "trialing" : "active",
        _billing_type: "paid",
        _payment_provider: provider,
        _provider_subscription_id: evt.providerSubscriptionId,
        _start: new Date().toISOString(),
        _end: evt.periodEnd,
        _metadata: { event_id: evt.eventId, event_type: evt.eventType, environment },
      } as never);
      if (applyErr) throw new Error(`subscription activation failed: ${applyErr.message}`);

      if (tx) {
        const subId = (Array.isArray(sub) ? sub[0] : sub) as { id?: string } | null;
        await supabaseAdmin
          .from("payment_transactions")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            ...(subId?.id ? { subscription_id: subId.id } : {}),
          })
          .eq("id", tx.id);
      }
    } else if (evt.lifecycle === "payment_failed") {
      // فشل دفعة واحدة لا يلغي اشتراكًا قائمًا
      if (tx) {
        await supabaseAdmin
          .from("payment_transactions")
          .update({ status: "failed" })
          .eq("id", tx.id);
      }
    } else {
      const statusMap: Record<string, string> = {
        past_due: "past_due",
        paused: "paused",
        cancelled: "cancelled",
        expired: "expired",
        refunded: "refunded",
      };
      const next = statusMap[evt.lifecycle]!;
      const { error: lifeErr } = await supabaseAdmin.rpc("set_subscription_status", {
        _user_id: userId,
        _status: next,
        _reason: `webhook:${evt.eventType}`,
        ...(next === "refunded" || next === "cancelled" || next === "expired"
          ? { _end: new Date().toISOString() }
          : {}),
      } as never);
      if (lifeErr) throw new Error(`lifecycle update failed: ${lifeErr.message}`);
      if (evt.lifecycle === "refunded") {
        if (tx) {
          await supabaseAdmin
            .from("payment_transactions")
            .update({ status: "refunded" })
            .eq("id", tx.id);
        } else {
          // لا يوجد مرجع مباشر — نعلّم آخر عملية مدفوعة لهذا المستخدم لدى المزوّد
          const { data: last } = await supabaseAdmin
            .from("payment_transactions")
            .select("id")
            .eq("user_id", userId)
            .eq("provider", provider)
            .eq("status", "paid")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (last?.id) {
            await supabaseAdmin
              .from("payment_transactions")
              .update({ status: "refunded" })
              .eq("id", last.id);
          }
        }
      }
    }

    await finish("processed", userId, `dbg:${evt.lifecycle}`);

    await supabaseAdmin.from("activity_logs").insert({
      user_id: userId,
      action: `subscription_${evt.lifecycle}`,
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
}

function monthFromNow() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

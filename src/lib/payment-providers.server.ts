/**
 * Server-only: سجلّ بوابات الدفع + تخزين آمن لبيانات الاعتماد.
 *
 * قواعد الأمان:
 *  - الأسرار تُشفَّر (AES-256-GCM) بمفتاح خادم (PAYMENT_SECRETS_KEY) وتُخزَّن في
 *    جدول مقفل تمامًا (لا صلاحيات لأي دور عدا service_role، ولا سياسات RLS).
 *  - لا تُعاد أي قيمة سرّية إلى الواجهة إطلاقًا — فقط "configured: true/false".
 *  - لا تُسجَّل أي قيمة سرّية في السجلات أو رسائل الأخطاء.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/* Registry — إضافة بوابة جديدة = إضافة عنصر هنا + معالج webhook       */
/* ------------------------------------------------------------------ */

export type ProviderField = {
  key: string;
  label: string;
  /** سرّي => يُخزَّن مشفّرًا ولا يُعاد أبدًا. غير سرّي => يُخزَّن في config. */
  secret: boolean;
  required: boolean;
  placeholder?: string;
  hint?: string;
};

export type ProviderEnv = { value: string; label: string };

export type ProviderDef = {
  id: string;
  displayName: string;
  doc: string;
  environments: ProviderEnv[];
  defaultCurrency: string;
  /** الحقول تُخزَّن لكل بيئة على حدة (test/live لا يختلطان). */
  fields: ProviderField[];
  /** هل يوفّر المزوّد طريقة فعلية لاختبار بيانات الاعتماد؟ */
  supportsConnectionTest: boolean;
  /** آلية الإشعار الرسمية. */
  callbackKind: "webhook" | "callback";
  webhookPath: string;
  /** هل يدعم اشتراكات متكرّرة تلقائيًا؟ */
  recurring: boolean;
  notes?: string;
};

export const PROVIDERS: ProviderDef[] = [
  {
    id: "paytr",
    displayName: "PayTR",
    doc: "https://dev.paytr.com",
    environments: [
      { value: "test", label: "Test" },
      { value: "live", label: "Live" },
    ],
    defaultCurrency: "TL",
    fields: [
      { key: "merchant_id", label: "Merchant ID", secret: true, required: true },
      { key: "merchant_key", label: "Merchant Key", secret: true, required: true },
      { key: "merchant_salt", label: "Merchant Salt", secret: true, required: true },
      {
        key: "pro_amount",
        label: "مبلغ خطة Pro (بالكروش — 2500 = 25.00 TL)",
        secret: false,
        required: false,
        hint: "اختياري: إن تُرك فارغًا يُستخدم سعر الخطة من جدول الخطط.",
      },
    ],

    supportsConnectionTest: true,
    callbackKind: "callback",
    webhookPath: "/api/public/webhooks/payments/paytr",
    recurring: false,
    notes: "PayTR تُرسل نتيجة الدفع إلى Callback URL موقّعة بـ merchant_key/merchant_salt.",
  },
  {
    id: "paddle",
    displayName: "Paddle Billing",
    doc: "https://developer.paddle.com",
    environments: [
      { value: "sandbox", label: "Sandbox" },
      { value: "production", label: "Production" },
    ],
    defaultCurrency: "USD",
    fields: [
      {
        key: "client_token",
        label: "Client-side Token (عام)",
        secret: false,
        required: true,
        placeholder: "live_... / test_...",
        hint: "قيمة عامة مسموح استخدامها في الواجهة رسميًا.",
      },
      {
        key: "price_id",
        label: "Price ID لخطة Pro (عام)",
        secret: false,
        required: true,
        placeholder: "pri_...",
      },
      { key: "api_key", label: "API Key (سرّي)", secret: true, required: true },
      {
        key: "webhook_secret",
        label: "Webhook Signing Secret (سرّي)",
        secret: true,
        required: true,
        placeholder: "pdl_ntfset_...",
      },
    ],
    supportsConnectionTest: true,
    callbackKind: "webhook",
    webhookPath: "/api/public/webhooks/payments/paddle",
    recurring: true,
  },
  {
    id: "zaincash",
    displayName: "Zain Cash",
    doc: "https://docs.zaincash.iq",
    environments: [
      { value: "test", label: "Test" },
      { value: "production", label: "Production" },
    ],
    defaultCurrency: "IQD",
    fields: [
      { key: "merchant_id", label: "Merchant ID", secret: false, required: true },
      { key: "msisdn", label: "MSISDN (رقم التاجر)", secret: false, required: true },
      { key: "api_secret", label: "Secret (مفتاح توقيع JWT)", secret: true, required: true },
      {
        key: "pro_amount",
        label: "مبلغ خطة Pro (IQD)",
        secret: false,
        required: false,
        hint: "اختياري: إن تُرك فارغًا يُستخدم سعر الخطة من جدول الخطط.",
      },
    ],

    supportsConnectionTest: false,
    callbackKind: "callback",
    webhookPath: "/api/public/webhooks/payments/zaincash",
    recurring: false,
    notes:
      "Zain Cash لا يوفّر اشتراكات متكرّرة تلقائية ولا نقطة رسمية لاختبار بيانات الاعتماد — الدفع لدورة واحدة يدويًا عبر إعادة التوجيه ثم Callback موقّع بـ JWT.",
  },
  {
    id: "paypal_manual",
    displayName: "PayPal Manual",
    doc: "https://www.paypal.com",
    environments: [{ value: "manual", label: "Manual" }],
    defaultCurrency: "USD",
    fields: [
      { key: "account", label: "PayPal account / email", secret: false, required: true },
      {
        key: "instructions",
        label: "Payment instructions",
        secret: false,
        required: true,
        hint: "Shown to customers before they submit their proof.",
      },
    ],
    supportsConnectionTest: false,
    callbackKind: "callback",
    webhookPath: "",
    recurring: false,
    notes: "Manual review only — no API, callback, or automatic renewal.",
  },
  {
    id: "zaincash_manual",
    displayName: "Zain Cash Manual",
    doc: "https://www.zaincash.iq",
    environments: [{ value: "manual", label: "Manual" }],
    defaultCurrency: "IQD",
    fields: [
      { key: "account", label: "Zain Cash number / account", secret: false, required: true },
      {
        key: "instructions",
        label: "Payment instructions",
        secret: false,
        required: true,
        hint: "Shown to customers before they submit their proof.",
      },
    ],
    supportsConnectionTest: false,
    callbackKind: "callback",
    webhookPath: "",
    recurring: false,
    notes: "Manual review only — no API, callback, or automatic renewal.",
  },
  {
    id: "card_manual",
    displayName: "Visa / Mastercard",
    doc: "",
    environments: [{ value: "manual", label: "Manual" }],
    defaultCurrency: "USD",
    fields: [
      {
        key: "instructions",
        label: "Payment instructions",
        secret: false,
        required: true,
      },
    ],
    supportsConnectionTest: false,
    callbackKind: "callback",
    webhookPath: "",
    recurring: false,
    notes: "Disabled by default. Enable only after configuring a verified manual process.",
  },
];

export const getProviderDef = (id: string) => PROVIDERS.find((p) => p.id === id);

/* ------------------------------------------------------------------ */
/* Encryption (AES-256-GCM)                                            */
/* ------------------------------------------------------------------ */

async function aesKey(): Promise<CryptoKey> {
  const raw = process.env["PAYMENT_SECRETS_KEY"];
  if (!raw) throw new Error("تخزين الأسرار غير مهيّأ على الخادم");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain)),
  );
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decryptSecret(stored: string): Promise<string> {
  const [v, ivB, ctB] = stored.split(".");
  if (v !== "v1" || !ivB || !ctB) throw new Error("قيمة مخزّنة غير صالحة");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(ivB) },
    await aesKey(),
    unb64(ctB),
  );
  return new TextDecoder().decode(pt);
}

/* ------------------------------------------------------------------ */
/* Base URL (قابل للتهيئة — لا نطاق مثبّت داخل منطق الدفع)             */
/* ------------------------------------------------------------------ */

/**
 * أصل الموقع العام المستخدم في روابط الـ callback / webhook.
 * يُقرأ من متغيّرات البيئة أولًا (APP_URL أو PUBLIC_BASE_URL) ثم من رأس الطلب.
 * لا يوجد أي نطاق مكتوب داخل منطق الدفع نفسه.
 */
export function appBaseUrl(request?: Request): string {
  const fromEnv = process.env["APP_URL"] ?? process.env["PUBLIC_BASE_URL"] ?? "";
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (request) {
    try {
      const u = new URL(request.url);
      const proto = request.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
      const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? u.host;
      if (host) return `${proto}://${host}`;
    } catch {
      /* ignore */
    }
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

type Db = SupabaseClient<never>;

export type TestResult2 = { ok: boolean; at: string; message: string };

export type ProviderSettingsRow = {
  provider: string;
  display_name: string;
  enabled: boolean;
  environment: string;
  currency: string;
  config: Record<string, string>;
  status: string;
  last_error: string | null;
  last_tested_at: string | null;
  test_results?: Record<string, TestResult2> | null;
};

/** قيمة إعداد عام معزولة حسب البيئة: `<env>:<key>`. */
export function cfgValue(
  row: ProviderSettingsRow | null,
  environment: string,
  key: string,
): string | null {
  const cfg = row?.config ?? {};
  const scoped = cfg[`${environment}:${key}`];
  if (scoped !== undefined && scoped !== null && String(scoped).trim() !== "") return String(scoped);
  // توافق خلفي فقط مع البيانات المحفوظة قبل الفصل، ولنفس بيئة الصفّ.
  const hasScoped = Object.keys(cfg).some((k) => k.startsWith(`${environment}:`));
  if (!hasScoped && row?.environment === environment) {
    const legacy = cfg[key];
    if (legacy && String(legacy).trim() !== "") return String(legacy);
  }
  return null;
}

export function readTestResult(
  row: ProviderSettingsRow | null,
  environment: string,
): TestResult2 | null {
  const map = (row?.test_results ?? {}) as Record<string, TestResult2>;
  return map[environment] ?? null;
}


async function db(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

export async function readSettings(provider: string): Promise<ProviderSettingsRow | null> {
  const client = await db();
  const { data } = await client
    .from("payment_provider_settings")
    .select("*")
    .eq("provider", provider)
    .maybeSingle();
  return (data as ProviderSettingsRow | null) ?? null;
}

export async function readAllSettings(): Promise<ProviderSettingsRow[]> {
  const client = await db();
  const { data } = await client.from("payment_provider_settings").select("*");
  return (data as ProviderSettingsRow[] | null) ?? [];
}

/** أسماء المفاتيح السرّية المضبوطة لبيئة معيّنة (بدون أي قيم). */
export async function configuredSecretKeys(provider: string, environment: string): Promise<string[]> {
  const client = await db();
  const { data } = await client
    .from("payment_provider_secrets")
    .select("key")
    .eq("provider", provider)
    .eq("environment", environment);
  return ((data as Array<{ key: string }> | null) ?? []).map((r) => r.key);
}

export async function getSecret(
  provider: string,
  environment: string,
  key: string,
): Promise<string | null> {
  const client = await db();
  const { data } = await client
    .from("payment_provider_secrets")
    .select("value_encrypted")
    .eq("provider", provider)
    .eq("environment", environment)
    .eq("key", key)
    .maybeSingle();
  const enc = (data as { value_encrypted: string } | null)?.value_encrypted;
  if (!enc) return null;
  try {
    return await decryptSecret(enc);
  } catch {
    return null;
  }
}

export async function putSecret(
  provider: string,
  environment: string,
  key: string,
  value: string,
  updatedBy: string,
): Promise<void> {
  const client = await db();
  await client.from("payment_provider_secrets").upsert(
    {
      provider,
      environment,
      key,
      value_encrypted: await encryptSecret(value),
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "provider,environment,key" },
  );
}

export async function deleteSecret(provider: string, environment: string, key: string) {
  const client = await db();
  await client
    .from("payment_provider_secrets")
    .delete()
    .eq("provider", provider)
    .eq("environment", environment)
    .eq("key", key);
}

/** هل اكتملت كل الحقول المطلوبة لبيئة محدّدة؟ (عزل كامل بين البيئات) */
export async function completeness(
  def: ProviderDef,
  row: ProviderSettingsRow | null,
  env?: string,
) {
  const environment = env ?? row?.environment ?? def.environments[0]!.value;
  const secretKeys = new Set(await configuredSecretKeys(def.id, environment));
  const fields = def.fields.map((f) => {
    const value = f.secret ? null : cfgValue(row, environment, f.key);
    return {
      key: f.key,
      label: f.label,
      secret: f.secret,
      required: f.required,
      configured: f.secret ? secretKeys.has(f.key) : Boolean(value),
      // القيم العامة فقط تُعاد إلى الواجهة
      value,
    };
  });
  const complete = fields.filter((f) => f.required).every((f) => f.configured);
  return { environment, fields, complete };
}

/**
 * شروط التفعيل — تُفرض على الخادم:
 * اكتمال الإعدادات + (لمن يدعم الاختبار) اختبار ناجح لنفس البيئة.
 */
export async function canEnable(
  def: ProviderDef,
  row: ProviderSettingsRow | null,
  environment: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { complete } = await completeness(def, row, environment);
  if (!complete) return { ok: false, reason: "الإعدادات المطلوبة غير مكتملة لهذه البيئة." };
  if (!def.supportsConnectionTest) return { ok: true };
  const t = readTestResult(row, environment);
  if (!t) return { ok: false, reason: "نفّذ Test Connection لهذه البيئة أولًا." };
  if (!t.ok) return { ok: false, reason: "آخر اختبار اتصال لهذه البيئة لم ينجح." };
  return { ok: true };
}


export function computeStatus(opts: {
  complete: boolean;
  enabled: boolean;
  lastError: string | null;
}): "not_configured" | "configured" | "enabled" | "disabled" | "error" {
  if (!opts.complete) return "not_configured";
  if (opts.lastError) return "error";
  if (opts.enabled) return "enabled";
  return "configured";
}

/* ------------------------------------------------------------------ */
/* Connection tests (حقيقية فقط — لا اختبارات وهمية)                   */
/* ------------------------------------------------------------------ */

export type TestResult = { supported: boolean; ok: boolean; message: string };

async function testPaddle(environment: string): Promise<TestResult> {
  const apiKey = await getSecret("paddle", environment, "api_key");
  if (!apiKey) return { supported: true, ok: false, message: "بيانات الاعتماد غير مكتملة" };
  const base =
    environment === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  try {
    const res = await fetch(`${base}/event-types`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { supported: true, ok: true, message: "Connection successful" };
    return {
      supported: true,
      ok: false,
      message: `Connection failed (HTTP ${res.status}) — تحقّق من المفتاح والبيئة.`,
    };
  } catch {
    return { supported: true, ok: false, message: "تعذّر الوصول إلى Paddle API" };
  }
}

async function hmacBase64(key: string, message: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
  return b64(sig);
}

async function testPaytr(environment: string): Promise<TestResult> {
  const id = await getSecret("paytr", environment, "merchant_id");
  const key = await getSecret("paytr", environment, "merchant_key");
  const salt = await getSecret("paytr", environment, "merchant_salt");
  if (!id || !key || !salt)
    return { supported: true, ok: false, message: "بيانات الاعتماد غير مكتملة" };

  // طلب token حقيقي بأصغر حمولة ممكنة: PayTR يرفض التوقيع الخاطئ فورًا.
  const merchant_oid = `test${Date.now()}`;
  const user_basket = btoa(JSON.stringify([["connection-test", "1.00", 1]]));
  const payment_amount = "100";
  const no_installment = "1";
  const max_installment = "0";
  const currency = "TL";
  const test_mode = environment === "live" ? "0" : "1";
  const user_ip = "127.0.0.1";
  const hashStr = `${id}${user_ip}${merchant_oid}test@example.com${payment_amount}${user_basket}${no_installment}${max_installment}${currency}${test_mode}`;
  const paytr_token = await hmacBase64(key, hashStr + salt);

  const form = new URLSearchParams({
    merchant_id: id,
    user_ip,
    merchant_oid,
    email: "test@example.com",
    payment_amount,
    paytr_token,
    user_basket,
    debug_on: "1",
    no_installment,
    max_installment,
    currency,
    test_mode,
    user_name: "connection test",
    user_address: "test",
    user_phone: "05000000000",
    merchant_ok_url: "https://example.com/ok",
    merchant_fail_url: "https://example.com/fail",
    timeout_limit: "5",
  });

  try {
    const res = await fetch("https://www.paytr.com/odeme/api/get-token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const json = (await res.json()) as { status?: string; reason?: string };
    if (json.status === "success") return { supported: true, ok: true, message: "Connection successful" };
    return {
      supported: true,
      ok: false,
      message: "Connection failed — تحقّق من بيانات الحساب والبيئة.",
    };
  } catch {
    return { supported: true, ok: false, message: "تعذّر الوصول إلى PayTR API" };
  }
}

export async function testConnection(provider: string, environment: string): Promise<TestResult> {
  if (provider === "paddle") return testPaddle(environment);
  if (provider === "paytr") return testPaytr(environment);
  return {
    supported: false,
    ok: false,
    message: "هذا المزوّد لا يوفّر نقطة رسمية لاختبار بيانات الاعتماد.",
  };
}

/* ------------------------------------------------------------------ */
/* Test results (مخزَّنة لكل بيئة على حدة — بدون أي أسرار)             */
/* ------------------------------------------------------------------ */

export async function recordTestResult(
  provider: string,
  environment: string,
  result: TestResult,
): Promise<void> {
  const client = await db();
  const row = await readSettings(provider);
  const map = { ...((row?.test_results ?? {}) as Record<string, TestResult2>) };
  map[environment] = { ok: result.ok, at: new Date().toISOString(), message: result.message };
  await client
    .from("payment_provider_settings")
    .update({
      test_results: map as never,
      last_tested_at: new Date().toISOString(),
      last_error: result.ok ? null : result.message,
      // أي فشل اختبار يوقف التفعيل فورًا
      ...(result.ok ? {} : { enabled: false }),
    } as never)
    .eq("provider", provider);
}

/* ------------------------------------------------------------------ */
/* Checkout — تُنشأ على الخادم فقط، ولا يصل أي سرّ إلى المتصفح          */
/* ------------------------------------------------------------------ */

export type CheckoutInput = {
  def: ProviderDef;
  row: ProviderSettingsRow | null;
  environment: string;
  userId: string;
  email: string | null;
  plan: string;
  /** المبلغ بالوحدة الصغرى لعملة المزوّد (kuruş/cent)، أو بالوحدة الكاملة لـ IQD. */
  amount: number;
  currency: string;
  merchantOid: string;
  baseUrl: string;
  clientIp: string;
};

export type CheckoutResult = { url: string; reference: string | null };

async function paddleCheckout(i: CheckoutInput): Promise<CheckoutResult> {
  const apiKey = await getSecret("paddle", i.environment, "api_key");
  const priceId = cfgValue(i.row, i.environment, "price_id");
  if (!apiKey || !priceId) throw new Error("بوابة الدفع غير مكتملة الإعداد لهذه البيئة.");
  const base =
    i.environment === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

  const res = await fetch(`${base}/transactions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      custom_data: { merchant_oid: i.merchantOid, user_id: i.userId, plan: i.plan },
      checkout: { url: `${i.baseUrl}/dashboard?checkout=paddle` },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { id?: string; checkout?: { url?: string } };
  };
  const url = json.data?.checkout?.url;
  if (!res.ok || !url) throw new Error("تعذّر إنشاء عملية الدفع لدى Paddle.");
  return { url, reference: json.data?.id ?? null };
}

async function paytrCheckout(i: CheckoutInput): Promise<CheckoutResult> {
  const id = await getSecret("paytr", i.environment, "merchant_id");
  const key = await getSecret("paytr", i.environment, "merchant_key");
  const salt = await getSecret("paytr", i.environment, "merchant_salt");
  if (!id || !key || !salt) throw new Error("بوابة الدفع غير مكتملة الإعداد لهذه البيئة.");

  const email = i.email ?? "customer@example.com";
  const amount = String(i.amount);
  const basket = btoa(
    unescape(encodeURIComponent(JSON.stringify([[`Plan ${i.plan}`, (i.amount / 100).toFixed(2), 1]]))),
  );
  const no_installment = "1";
  const max_installment = "0";
  const currency = i.currency || "TL";
  const test_mode = i.environment === "live" ? "0" : "1";
  const user_ip = i.clientIp;
  const hashStr = `${id}${user_ip}${i.merchantOid}${email}${amount}${basket}${no_installment}${max_installment}${currency}${test_mode}`;
  const paytr_token = await hmacBase64(key, hashStr + salt);

  const form = new URLSearchParams({
    merchant_id: id,
    user_ip,
    merchant_oid: i.merchantOid,
    email,
    payment_amount: amount,
    paytr_token,
    user_basket: basket,
    debug_on: "0",
    no_installment,
    max_installment,
    currency,
    test_mode,
    user_name: email.split("@")[0]!,
    user_address: "-",
    user_phone: "05000000000",
    merchant_ok_url: `${i.baseUrl}/dashboard?checkout=paytr&result=ok`,
    merchant_fail_url: `${i.baseUrl}/pricing?checkout=paytr&result=fail`,
    timeout_limit: "30",
  });

  const res = await fetch("https://www.paytr.com/odeme/api/get-token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string; token?: string };
  if (json.status !== "success" || !json.token) {
    throw new Error("تعذّر إنشاء عملية الدفع لدى PayTR.");
  }
  return { url: `https://www.paytr.com/odeme/guvenli/${json.token}`, reference: i.merchantOid };
}

function b64url(input: string) {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** توقيع JWT بـ HS256 (Zain Cash). */
export async function signJwtHs256(payload: Record<string, unknown>, secret: string) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = (await hmacBase64(secret, `${head}.${body}`))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${head}.${body}.${sig}`;
}

async function zaincashCheckout(i: CheckoutInput): Promise<CheckoutResult> {
  const merchantId = cfgValue(i.row, i.environment, "merchant_id");
  const msisdn = cfgValue(i.row, i.environment, "msisdn");
  const secret = await getSecret("zaincash", i.environment, "api_secret");
  if (!merchantId || !msisdn || !secret)
    throw new Error("بوابة الدفع غير مكتملة الإعداد لهذه البيئة.");

  const base =
    i.environment === "production" ? "https://api.zaincash.iq" : "https://test.zaincash.iq";
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwtHs256(
    {
      amount: i.amount,
      serviceType: `Plan ${i.plan}`,
      msisdn,
      orderId: i.merchantOid,
      redirectUrl: `${i.baseUrl}${i.def.webhookPath}`,
      iat: now,
      exp: now + 60 * 60 * 4,
    },
    secret,
  );

  const res = await fetch(`${base}/transaction/init`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, merchantId, lang: "ar" }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  if (!res.ok || !json.id) throw new Error("تعذّر إنشاء عملية الدفع لدى Zain Cash.");
  return { url: `${base}/transaction/pay?id=${json.id}`, reference: json.id };
}

export async function createProviderCheckout(i: CheckoutInput): Promise<CheckoutResult> {
  if (i.def.id === "paddle") return paddleCheckout(i);
  if (i.def.id === "paytr") return paytrCheckout(i);
  if (i.def.id === "zaincash") return zaincashCheckout(i);
  throw new Error("هذا المزوّد لا يدعم إنشاء عملية دفع.");
}

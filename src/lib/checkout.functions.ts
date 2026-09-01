import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * إنشاء عملية دفع حقيقية على الخادم فقط.
 *
 * القواعد:
 *  - المستخدم يُعرف من جلسة المصادقة (Bearer token) — لا يُقبل أي user_id من الواجهة.
 *  - يُنشأ سجل payment_transactions قبل التحويل إلى البوابة، ويحمل merchant_oid فريدًا.
 *  - لا يُعاد أي سرّ إلى المتصفح — فقط رابط صفحة الدفع.
 *  - تفعيل Pro لا يحدث هنا إطلاقًا؛ يحدث فقط عبر Webhook موقّع.
 */

export type CheckoutResponse = { url: string; provider: string; merchantOid: string };

function randomHex(bytes: number) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        provider: z.string().min(1).max(32),
        plan: z.string().min(1).max(32).default("pro"),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<CheckoutResponse> => {
    const store = await import("./payment-providers.server");
    const { currentUser, admin } = await import("./usage.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const user = await currentUser();
    if (!user) throw new Error("يجب تسجيل الدخول لإتمام الاشتراك.");

    const db = await admin();

    // الحساب موقوف؟
    const { data: prof } = await db
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .maybeSingle();
    if ((prof as { status?: string } | null)?.status === "disabled") {
      throw new Error("حسابك موقوف — تواصل مع الدعم.");
    }

    const def = store.getProviderDef(data.provider);
    if (!def) throw new Error("مزوّد غير معروف.");

    const row = await store.readSettings(def.id);
    if (!row?.enabled) throw new Error("بوابة الدفع هذه غير مفعّلة حاليًا.");
    const environment = row.environment ?? def.environments[0]!.value;

    const gate = await store.canEnable(def, row, environment);
    if (!gate.ok) throw new Error("بوابة الدفع غير جاهزة حاليًا.");

    // الخطة والسعر من قاعدة البيانات (لا من الواجهة)
    const { data: planRow } = await db
      .from("plans")
      .select("code, price_cents, currency, is_active")
      .eq("code", data.plan)
      .maybeSingle();
    const plan = planRow as
      | { code: string; price_cents: number; currency: string; is_active: boolean }
      | null;
    if (!plan || !plan.is_active || plan.code === "free") throw new Error("خطة غير صالحة.");

    const currency = row.currency ?? def.defaultCurrency;
    const override = store.cfgValue(row, environment, "pro_amount");
    const amount =
      override && /^\d+$/.test(override.trim()) ? Number(override.trim()) : plan.price_cents;
    if (amount <= 0) throw new Error("مبلغ الخطة غير مضبوط.");

    // merchant_oid فريد: معرّف المستخدم (hex) + عشوائي — أبجدي رقمي فقط
    const merchantOid = `${user.id.replace(/-/g, "")}${randomHex(6)}`;

    const request = getRequest();
    const baseUrl = store.appBaseUrl(request ?? undefined);
    if (!baseUrl) throw new Error("عنوان الموقع غير مهيّأ على الخادم.");
    const clientIp =
      request?.headers.get("cf-connecting-ip") ??
      request?.headers.get("x-real-ip") ??
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "127.0.0.1";

    const { error: insErr } = await db.from("payment_transactions").insert({
      user_id: user.id,
      provider: def.id,
      environment,
      plan: plan.code,
      amount_cents: amount,
      currency,
      merchant_oid: merchantOid,
      status: "pending",
    } as never);
    if (insErr) throw new Error("تعذّر بدء عملية الدفع.");

    let checkout: { url: string; reference: string | null };
    try {
      checkout = await store.createProviderCheckout({
        def,
        row,
        environment,
        userId: user.id,
        email: user.email,
        plan: plan.code,
        amount,
        currency,
        merchantOid,
        baseUrl,
        clientIp,
      });
    } catch (e) {
      await db
        .from("payment_transactions")
        .update({ status: "failed", metadata: { error: (e as Error).message } as never } as never)
        .eq("merchant_oid", merchantOid);
      throw new Error((e as Error).message);
    }

    await db
      .from("payment_transactions")
      .update({
        provider_reference: checkout.reference,
        checkout_url: checkout.url,
        status: "created",
      } as never)
      .eq("merchant_oid", merchantOid);

    await db.from("activity_logs").insert({
      user_id: user.id,
      action: "checkout_started",
      detail: `${def.id}:${environment}`,
      metadata: { merchant_oid: merchantOid, plan: plan.code } as never,
    });

    return { url: checkout.url, provider: def.id, merchantOid };
  });

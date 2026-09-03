import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PaymentRequest = {
  id: string;
  userId: string;
  userEmail: string | null;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  transactionId: string | null;
  paymentProof: string | null;
  paymentProofUrl: string | null;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
};

type RequestRecord = Record<string, unknown>;

async function paymentProviders() {
  return await import("./payments.functions");
}

async function getUserOrThrow() {
  const { currentUser } = await import("./usage.server");
  const user = await currentUser();
  if (!user) throw new Error("يجب تسجيل الدخول لإتمام طلب الدفع.");
  return user;
}

async function adminContext() {
  const { assertAdmin } = await import("./admin.server");
  const { admin } = await import("./usage.server");
  const actor = await assertAdmin();
  return { actor, db: await admin() };
}

async function proofUrl(db: any, path: string | null) {
  if (!path) return null;
  const { data } = await db.storage.from("payment-proofs").createSignedUrl(path, 60 * 15);
  return data?.signedUrl ?? null;
}

async function toRequest(db: any, row: RequestRecord, userEmail: string | null): Promise<PaymentRequest> {
  const status = String(row["status"] ?? "pending");
  return {
    id: String(row["id"]),
    userId: String(row["user_id"]),
    userEmail,
    planId: String(row["plan_id"]),
    planName: String(row["plan_name"]),
    amount: Number(row["amount"] ?? 0),
    currency: String(row["currency"] ?? "USD"),
    paymentMethod: String(row["payment_method"] ?? ""),
    transactionId: (row["transaction_id"] as string | null) ?? null,
    paymentProof: (row["payment_proof"] as string | null) ?? null,
    paymentProofUrl: await proofUrl(db, (row["payment_proof"] as string | null) ?? null),
    status: status === "approved" || status === "rejected" ? status : "pending",
    submittedAt: String(row["submitted_at"]),
    reviewedAt: (row["reviewed_at"] as string | null) ?? null,
    rejectionReason: (row["rejection_reason"] as string | null) ?? null,
  };
}

export const createManualPaymentRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        provider: z.enum(["paypal_manual", "zaincash_manual", "card_manual"]),
        plan: z.string().min(1).max(32),
        transactionId: z.string().trim().max(160).optional(),
        paymentProof: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const user = await getUserOrThrow();
    if (data.paymentProof && !data.paymentProof.startsWith(`${user.id}/`)) {
      throw new Error("مسار إثبات الدفع غير صالح.");
    }

    const { listAvailablePaymentProviders } = await paymentProviders();
    const providers = await listAvailablePaymentProviders();
    const provider = providers.find((item) => item.id === data.provider);
    if (!provider) throw new Error("طريقة الدفع اليدوي غير متاحة حاليًا.");

    const { admin } = await import("./usage.server");
    const db = await admin();
    const { data: planRow } = await db
      .from("plans")
      .select("code, name, price_cents, currency, is_active")
      .eq("code", data.plan)
      .maybeSingle();
    const plan = planRow as
      | { code: string; name: string; price_cents: number; currency: string; is_active: boolean }
      | null;
    if (!plan || !plan.is_active || plan.code === "free" || plan.price_cents <= 0) {
      throw new Error("الخطة غير صالحة.");
    }

    const { data: existing } = await db
      .from("payment_requests")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) throw new Error("لديك طلب دفع قيد المراجعة بالفعل.");

    const { data: created, error } = await db
      .from("payment_requests")
      .insert({
        user_id: user.id,
        plan_id: plan.code,
        plan_name: plan.name,
        amount: plan.price_cents,
        currency: plan.currency || provider.currency,
        payment_method: provider.id,
        transaction_id: data.transactionId?.trim() || null,
        payment_proof: data.paymentProof || null,
        status: "pending",
      } as never)
      .select("*")
      .single();
    if (error || !created) throw new Error("تعذّر إرسال طلب الدفع.");

    await db.from("activity_logs").insert({
      user_id: user.id,
      action: "manual_payment_request_submitted",
      detail: provider.id,
      metadata: { plan: plan.code } as never,
    });

    return await toRequest(db, created as RequestRecord, user.email);
  });

export const listMyPaymentRequests = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getUserOrThrow();
  const { admin } = await import("./usage.server");
  const db = await admin();
  const { data, error } = await db
    .from("payment_requests")
    .select("*")
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error("تعذّر تحميل طلبات الدفع.");
  return Promise.all(((data ?? []) as RequestRecord[]).map((row) => toRequest(db, row, user.email)));
});

export const adminListPaymentRequests = createServerFn({ method: "GET" }).handler(async () => {
  const { db } = await adminContext();
  const { data, error } = await db
    .from("payment_requests")
    .select("*")
    .order("submitted_at", { ascending: false });
  if (error) throw new Error("تعذّر تحميل طلبات الدفع.");

  const rows = (data ?? []) as RequestRecord[];
  const ids = [...new Set(rows.map((row) => String(row["user_id"])))];
  const { data: profiles } = ids.length
    ? await db.from("profiles").select("id, email").in("id", ids)
    : { data: [] };
  const emails = new Map(
    ((profiles ?? []) as Array<{ id: string; email: string | null }>).map((profile) => [profile.id, profile.email]),
  );
  return Promise.all(rows.map((row) => toRequest(db, row, emails.get(String(row["user_id"])) ?? null)));
});

export const adminReviewPaymentRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        rejectionReason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { actor, db } = await adminContext();
    const { data: row } = await db
      .from("payment_requests")
      .select("*")
      .eq("id", data.requestId)
      .eq("status", "pending")
      .maybeSingle();
    if (!row) throw new Error("طلب الدفع غير موجود أو تمت مراجعته سابقًا.");

    const request = row as RequestRecord;
    const userId = String(request["user_id"]);
    const planId = String(request["plan_id"]);
    const reason = data.rejectionReason?.trim() || null;

    const { data: userProfile } = await db
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    const { error: markedError } = await db
      .from("payment_requests")
      .update({
        status: data.decision === "approve" ? "approved" : "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: actor.id,
        rejection_reason: data.decision === "reject" ? reason : null,
      } as never)
      .eq("id", data.requestId)
      .eq("status", "pending");
    if (markedError) throw new Error("تعذّرت تحديث حالة الطلب.");

    if (data.decision === "approve") {
      const { data: plan } = await db
        .from("plans")
        .select("code, billing_interval")
        .eq("code", planId)
        .maybeSingle();
      if (!plan) throw new Error("الخطة المرتبطة بالطلب غير موجودة.");

      const start = new Date();
      const end = new Date(start);
      if (plan.billing_interval === "year") end.setFullYear(end.getFullYear() + 1);
      else end.setMonth(end.getMonth() + 1);

      const { error: subscriptionError } = await db.rpc("apply_subscription", {
        _user_id: userId,
        _plan: plan.code,
        _status: "active",
        _billing_type: "manual",
        _payment_provider: String(request["payment_method"]),
        _provider_subscription_id: String(request["transaction_id"] ?? data.requestId),
        _start: start.toISOString(),
        _end: end.toISOString(),
        _metadata: { payment_request_id: data.requestId, approved_by: actor.email },
      } as never);
      if (subscriptionError) {
        await db.from("payment_requests").update({ status: "pending", reviewed_at: null, reviewed_by: null } as never).eq("id", data.requestId);
        throw new Error("تعذّر تفعيل الاشتراك.");
      }

      await db.from("payment_transactions").insert({
        user_id: userId,
        provider: String(request["payment_method"]),
        environment: "manual",
        plan: plan.code,
        amount_cents: Number(request["amount"] ?? 0),
        currency: String(request["currency"] ?? "USD"),
        merchant_oid: `manual_${data.requestId}`,
        provider_reference: (request["transaction_id"] as string | null) ?? data.requestId,
        status: "paid",
        paid_at: new Date().toISOString(),
        metadata: { payment_request_id: data.requestId } as never,
      } as never);
    }

    await db.from("activity_logs").insert({
      user_id: userId,
      action: data.decision === "approve" ? "manual_payment_approved" : "manual_payment_rejected",
      detail: data.decision === "reject" ? reason : `approved_by:${actor.email}`,
      metadata: { payment_request_id: data.requestId } as never,
    });

    const { audit } = await import("./admin.server");
    await audit(
      actor,
      data.decision === "approve" ? "MANUAL_PAYMENT_APPROVED" : "MANUAL_PAYMENT_REJECTED",
      { id: userId, email: (userProfile as { email?: string | null } | null)?.email ?? null },
      { paymentRequestId: data.requestId, paymentMethod: request["payment_method"] },
      data.decision === "approve"
        ? { newPlan: planId, newStatus: "active", reason: "manual_payment" }
        : { reason },
    );

    return { ok: true };
  });

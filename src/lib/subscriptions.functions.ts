import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Plan = {
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  interval: string;
  invoiceLimit: number;
  processingLimit: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
};

export type SubscriptionRow = {
  id: string;
  plan: string;
  status: "active" | "inactive" | "expired" | "cancelled";
  billingType: "free" | "paid" | "admin_grant";
  paymentProvider: string | null;
  providerSubscriptionId: string | null;
  start: string | null;
  end: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export type SubscriptionStats = {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  adminGranted: number;
  paidSubscriptions: number;
};

async function ctx() {
  const { assertAdmin, audit } = await import("./admin.server");
  const { admin } = await import("./usage.server");
  return { assertAdmin, audit, db: await admin() };
}

type PlanRecord = {
  code: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  billing_interval: string;
  invoice_limit: number;
  processing_limit: number;
  features: unknown;
  is_active: boolean;
  sort_order: number;
};

const toPlan = (p: PlanRecord): Plan => ({
  code: p.code,
  name: p.name,
  description: p.description,
  priceCents: p.price_cents,
  currency: p.currency,
  interval: p.billing_interval,
  invoiceLimit: p.invoice_limit,
  processingLimit: p.processing_limit,
  features: Array.isArray(p.features) ? (p.features as string[]) : [],
  isActive: p.is_active,
  sortOrder: p.sort_order,
});

/* ------------------------------------------------------------------ */
/* Public: plans (pricing page reads from DB, not hardcoded)           */
/* ------------------------------------------------------------------ */

export const listPublicPlans = createServerFn({ method: "GET" }).handler(
  async (): Promise<Plan[]> => {
    const { publicClient } = await import("./usage.server");
    const { data } = await publicClient()
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    return ((data ?? []) as PlanRecord[]).map(toPlan);
  },
);

/* ------------------------------------------------------------------ */
/* User: my subscription (server-verified, never trusted from client)  */
/* ------------------------------------------------------------------ */

export type MySubscription = {
  plan: string;
  planName: string;
  status: string;
  billingType: string;
  paymentProvider: string | null;
  start: string | null;
  end: string | null;
  invoiceLimit: number;
  invoiceUsed: number;
  cancelAtPeriodEnd: boolean;
  /** عملة الاشتراك (من الباقة) — مستقلة تمامًا عن عملة الفواتير. */
  planCurrency: string;
  planPriceCents: number;
};

export const getMySubscription = createServerFn({ method: "GET" }).handler(
  async (): Promise<MySubscription | null> => {
    const { currentUser, admin } = await import("./usage.server");
    const user = await currentUser();
    if (!user) return null;
    const db = await admin();
    // ensure_profile syncs subscription state + applies expiry server-side
    await db.rpc("ensure_profile", {
      _user_id: user.id,
      ...(user.email ? { _email: user.email } : {}),
    });
    await db.rpc("sync_profile_subscription", { _user_id: user.id } as never);
    const { data } = await db
      .from("profiles")
      .select(
        "plan, subscription_status, billing_type, payment_provider, subscription_start, subscription_end, monthly_invoice_limit, monthly_invoice_usage",
      )
      .eq("id", user.id)
      .maybeSingle();
    if (!data) return null;

    const { data: planRow } = await db
      .from("plans")
      .select("name, currency, price_cents")
      .eq("code", data.plan)
      .maybeSingle();

    const { data: sub } = await db
      .from("subscriptions")
      .select("metadata, cancelled_at, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const meta = (sub as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const cancelAtPeriodEnd =
      meta["cancel_at_period_end"] === true &&
      (sub as { status?: string } | null)?.status === "active";

    return {
      plan: data.plan,
      planName: (planRow as { name?: string } | null)?.name ?? data.plan,
      status: data.subscription_status,
      billingType: (data as { billing_type: string }).billing_type,
      paymentProvider: (data as { payment_provider: string | null }).payment_provider,
      start: (data as { subscription_start: string | null }).subscription_start,
      end: (data as { subscription_end: string | null }).subscription_end,
      invoiceLimit: data.monthly_invoice_limit,
      invoiceUsed: data.monthly_invoice_usage,
      cancelAtPeriodEnd,
      planCurrency: (planRow as { currency?: string } | null)?.currency ?? "USD",
      planPriceCents: (planRow as { price_cents?: number } | null)?.price_cents ?? 0,
    };
  },
);

/* ------------------------------------------------------------------ */
/* User: cancel at period end / reactivate                             */
/* ------------------------------------------------------------------ */

async function myLatestSubscription() {
  const { currentUser, admin } = await import("./usage.server");
  const user = await currentUser();
  if (!user) throw new Error("يجب تسجيل الدخول.");
  const db = await admin();
  const { data } = await db
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { user, db, sub: data as Record<string, unknown> | null };
}

/**
 * إلغاء التجديد التلقائي — لا يحذف الحساب ولا الفواتير،
 * ويبقى المستخدم على باقته حتى نهاية الفترة المدفوعة.
 */
export const cancelMySubscription = createServerFn({ method: "POST" }).handler(async () => {
  const { user, db, sub } = await myLatestSubscription();
  if (!sub || sub["status"] !== "active" || sub["billing_type"] === "free") {
    throw new Error("لا يوجد اشتراك نشط لإلغائه.");
  }
  const end = sub["subscription_end"] as string | null;
  const meta = { ...((sub["metadata"] as Record<string, unknown>) ?? {}), cancel_at_period_end: true };

  if (!end || new Date(end).getTime() <= Date.now()) {
    // لا توجد فترة مدفوعة متبقية — ينتهي فورًا
    const { error } = await db.rpc("revoke_subscription", {
      _user_id: user.id,
      _reason: "user_cancelled",
    } as never);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db
      .from("subscriptions")
      .update({ cancelled_at: new Date().toISOString(), metadata: meta as never } as never)
      .eq("id", sub["id"] as string);
    if (error) throw new Error(error.message);
  }

  await db.from("activity_logs").insert({
    user_id: user.id,
    action: "subscription_cancel_requested",
    detail: end ?? null,
  });

  return { ok: true, activeUntil: end };
});

/** التراجع عن طلب الإلغاء ما دامت الفترة المدفوعة لم تنتهِ. */
export const reactivateMySubscription = createServerFn({ method: "POST" }).handler(async () => {
  const { user, db, sub } = await myLatestSubscription();
  if (!sub || sub["status"] !== "active") throw new Error("لا يمكن إعادة التفعيل — الاشتراك منتهٍ.");
  const end = sub["subscription_end"] as string | null;
  if (end && new Date(end).getTime() <= Date.now()) {
    throw new Error("انتهت الفترة المدفوعة — يلزم تجديد الاشتراك.");
  }
  const meta = {
    ...((sub["metadata"] as Record<string, unknown>) ?? {}),
    cancel_at_period_end: false,
  };
  const { error } = await db
    .from("subscriptions")
    .update({ cancelled_at: null, metadata: meta as never } as never)
    .eq("id", sub["id"] as string);
  if (error) throw new Error(error.message);

  await db.from("activity_logs").insert({
    user_id: user.id,
    action: "subscription_reactivated",
  });

  return { ok: true };
});


/* ------------------------------------------------------------------ */
/* Admin: plans management                                             */
/* ------------------------------------------------------------------ */

export const adminListPlans = createServerFn({ method: "GET" }).handler(
  async (): Promise<Plan[]> => {
    const { assertAdmin, db } = await ctx();
    await assertAdmin();
    const { data } = await db.from("plans").select("*").order("sort_order");
    return ((data ?? []) as PlanRecord[]).map(toPlan);
  },
);

export const adminUpdatePlan = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        code: z.string().min(1).max(32),
        name: z.string().min(1).max(64).optional(),
        priceCents: z.number().int().min(0).max(10_000_000).optional(),
        currency: z.string().min(3).max(8).optional(),
        invoiceLimit: z.number().int().min(0).max(1_000_000).optional(),
        processingLimit: z.number().int().min(0).max(1_000_000).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { assertAdmin, audit, db } = await ctx();
    const actor = await assertAdmin();

    const patch: Record<string, string | number | boolean> = {};
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.priceCents !== undefined) patch["price_cents"] = data.priceCents;
    if (data.currency !== undefined) patch["currency"] = data.currency;
    if (data.invoiceLimit !== undefined) patch["invoice_limit"] = data.invoiceLimit;
    if (data.processingLimit !== undefined) patch["processing_limit"] = data.processingLimit;
    if (data.isActive !== undefined) patch["is_active"] = data.isActive;

    const { error } = await db.from("plans").update(patch as never).eq("code", data.code);
    if (error) throw new Error(error.message);

    // كل من هو على هذه الخطة يجب أن تُحدَّث حدوده فورًا
    const { data: holders } = await db.from("profiles").select("id").eq("plan", data.code);
    for (const h of holders ?? []) {
      await db.rpc("sync_profile_subscription", { _user_id: h.id } as never);
    }

    await audit(actor, "admin_updated_plan", undefined, { plan: data.code, ...patch });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Admin: subscription overview                                        */
/* ------------------------------------------------------------------ */

export const adminSubscriptionStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<SubscriptionStats> => {
    const { assertAdmin, db } = await ctx();
    await assertAdmin();
    await db.rpc("expire_due_subscriptions" as never);

    const { data: profiles } = await db.from("profiles").select("plan, subscription_status");
    const { data: subs } = await db.from("subscriptions").select("status, billing_type");

    const p = profiles ?? [];
    const s = (subs ?? []) as Array<{ status: string; billing_type: string }>;

    return {
      totalUsers: p.length,
      freeUsers: p.filter((r) => r.plan !== "pro").length,
      proUsers: p.filter((r) => r.plan === "pro").length,
      activeSubscriptions: s.filter((r) => r.status === "active").length,
      expiredSubscriptions: s.filter((r) => r.status === "expired").length,
      adminGranted: s.filter((r) => r.status === "active" && r.billing_type === "admin_grant")
        .length,
      paidSubscriptions: s.filter((r) => r.status === "active" && r.billing_type === "paid").length,
    };
  },
);

export const adminUserSubscriptions = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data }): Promise<SubscriptionRow[]> => {
    const { assertAdmin, db } = await ctx();
    await assertAdmin();
    const { data: rows } = await db
      .from("subscriptions")
      .select("*")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false });
    return ((rows ?? []) as Array<Record<string, string | null>>).map((r) => ({
      id: r["id"]!,
      plan: r["plan"]!,
      status: r["status"] as SubscriptionRow["status"],
      billingType: r["billing_type"] as SubscriptionRow["billingType"],
      paymentProvider: r["payment_provider"] ?? null,
      providerSubscriptionId: r["provider_subscription_id"] ?? null,
      start: r["subscription_start"] ?? null,
      end: r["subscription_end"] ?? null,
      cancelledAt: r["cancelled_at"] ?? null,
      createdAt: r["created_at"]!,
    }));
  });

/* ------------------------------------------------------------------ */
/* Admin: grant / revoke                                               */
/* ------------------------------------------------------------------ */

export const adminGrantPlan = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        plan: z.string().min(1).max(32).default("pro"),
        days: z.number().int().min(1).max(3650),
        reason: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { assertAdmin, audit, db } = await ctx();
    const actor = await assertAdmin();

    const { data: plan } = await db.from("plans").select("code").eq("code", data.plan).maybeSingle();
    if (!plan) throw new Error("الخطة غير موجودة");

    const { data: before } = await db
      .from("profiles")
      .select("email, plan, subscription_status")
      .eq("id", data.userId)
      .maybeSingle();
    if (!before) throw new Error("المستخدم غير موجود");

    const start = new Date();
    const end = new Date(start.getTime() + data.days * 86400000);

    const { error } = await db.rpc("apply_subscription", {
      _user_id: data.userId,
      _plan: data.plan,
      _status: "active",
      _billing_type: "admin_grant",
      _payment_provider: "admin",
      _provider_subscription_id: null,
      _start: start.toISOString(),
      _end: end.toISOString(),
      _metadata: { granted_by: actor.email, reason: data.reason ?? null },
    } as never);
    if (error) throw new Error(error.message);

    await db.from("activity_logs").insert({
      user_id: data.userId,
      action: "subscription_granted",
      detail: `${data.plan} — ${data.days} يوم`,
    });

    await audit(
      actor,
      "GRANT_PRO",
      { id: data.userId, email: before.email },
      { days: data.days },
      {
        oldPlan: before.plan,
        newPlan: data.plan,
        oldStatus: before.subscription_status,
        newStatus: "active",
        durationDays: data.days,
        reason: data.reason ?? null,
      },
    );

    return { ok: true, end: end.toISOString() };
  });

export const adminRevokePlan = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ userId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(i),
  )
  .handler(async ({ data }) => {
    const { assertAdmin, audit, db } = await ctx();
    const actor = await assertAdmin();

    const { data: before } = await db
      .from("profiles")
      .select("email, plan, subscription_status, billing_type")
      .eq("id", data.userId)
      .maybeSingle();
    if (!before) throw new Error("المستخدم غير موجود");

    const { error } = await db.rpc("revoke_subscription", {
      _user_id: data.userId,
      _reason: data.reason ?? null,
    } as never);
    if (error) throw new Error(error.message);

    await db.from("activity_logs").insert({
      user_id: data.userId,
      action: "subscription_revoked",
      detail: data.reason ?? null,
    });

    await audit(
      actor,
      "REVOKE_PRO",
      { id: data.userId, email: before.email },
      { previousBilling: (before as { billing_type?: string }).billing_type ?? null },
      {
        oldPlan: before.plan,
        newPlan: "free",
        oldStatus: before.subscription_status,
        newStatus: "cancelled",
        reason: data.reason ?? null,
      },
    );

    return { ok: true };
  });

/** فحص يدوي/دوري لانتهاء الاشتراكات (يُنفَّذ أيضًا تلقائيًا عند كل قراءة للخطة). */
export const adminExpireDue = createServerFn({ method: "POST" }).handler(async () => {
  const { assertAdmin, db } = await ctx();
  await assertAdmin();
  const { data } = await db.rpc("expire_due_subscriptions" as never);
  return { expired: Number(data ?? 0) };
});

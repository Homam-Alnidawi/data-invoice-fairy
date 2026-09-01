import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: "admin" | "user";
  status: "active" | "disabled";
  createdAt: string | null;
  lastLoginAt: string | null;
  lastActivity: string | null;
  plan: string;
  processingOperations: number;
  invoicesProcessed: number;
  tempUploads: number;
  processingRequests: number;
  excelExports: number;
  pdfExports: number;
};

export type AdminOverview = {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  newUsers30d: number;
  processingOperations: number;
  invoicesProcessed: number;
  excelExports: number;
  pdfExports: number;
  tempUploads: number;
  guestRuns: number;
  daily: Array<{ day: string; count: number }>;
  topUsers: Array<{ email: string | null; invoices: number }>;
};

const BAN_FOREVER = "876000h";

async function ctx() {
  const { assertAdmin, audit, logActivity } = await import("./admin.server");
  const { admin } = await import("./usage.server");
  return { assertAdmin, audit, logActivity, db: await admin() };
}

/** هل المستخدم الحالي مدير؟ يُحسب على الخادم. */
export const amIAdmin = createServerFn({ method: "GET" }).handler(async (): Promise<boolean> => {
  const { isCallerAdmin } = await import("./admin.server");
  return isCallerAdmin();
});

export const adminOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminOverview> => {
    const { assertAdmin, db } = await ctx();
    await assertAdmin();

    const { data: profiles } = await db
      .from("profiles")
      .select("id, email, status, created_at");
    const { data: stats } = await db
      .from("user_usage_stats")
      .select(
        "user_id, processing_operations, invoices_processed, temp_uploads, excel_exports, pdf_exports",
      );
    const { data: guests } = await db.from("guest_usage").select("used");
    const { data: logs } = await db
      .from("activity_logs")
      .select("created_at, action")
      .gte("created_at", new Date(Date.now() - 13 * 86400000).toISOString());

    const rows = profiles ?? [];
    const s = stats ?? [];
    const sum = (k: keyof (typeof s)[number]) =>
      s.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);

    const cutoff = Date.now() - 30 * 86400000;
    const byUser = new Map(rows.map((r) => [r.id, r.email]));

    const daily: Array<{ day: string; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      daily.push({
        day: d,
        count: (logs ?? []).filter(
          (l) => l.action === "invoice_processed" && String(l.created_at).slice(0, 10) === d,
        ).length,
      });
    }

    const topUsers = [...s]
      .sort((a, b) => (b.invoices_processed ?? 0) - (a.invoices_processed ?? 0))
      .slice(0, 5)
      .map((r) => ({
        email: byUser.get(r.user_id) ?? null,
        invoices: r.invoices_processed ?? 0,
      }));

    return {
      totalUsers: rows.length,
      activeUsers: rows.filter((r) => r.status !== "disabled").length,
      disabledUsers: rows.filter((r) => r.status === "disabled").length,
      newUsers30d: rows.filter((r) => new Date(r.created_at).getTime() >= cutoff).length,
      processingOperations: sum("processing_operations"),
      invoicesProcessed: sum("invoices_processed"),
      excelExports: sum("excel_exports"),
      pdfExports: sum("pdf_exports"),
      tempUploads: sum("temp_uploads"),
      guestRuns: (guests ?? []).reduce((a, g) => a + (g.used ?? 0), 0),
      daily,
      topUsers,
    };
  },
);

export const listUsers = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminUserRow[]> => {
    const { assertAdmin, db } = await ctx();
    await assertAdmin();

    const { data: profiles } = await db
      .from("profiles")
      .select("id, email, name, status, plan, created_at, last_activity, last_login_at");
    const { data: roles } = await db.from("user_roles").select("user_id, role");
    const { data: stats } = await db.from("user_usage_stats").select("*");

    const { data: authList } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authById = new Map((authList?.users ?? []).map((u) => [u.id, u]));

    const roleById = new Map<string, "admin" | "user">();
    for (const r of roles ?? []) {
      if (r.role === "admin") roleById.set(r.user_id, "admin");
      else if (!roleById.has(r.user_id)) roleById.set(r.user_id, "user");
    }
    const statById = new Map((stats ?? []).map((r) => [r.user_id, r]));

    return (profiles ?? []).map((p) => {
      const st = statById.get(p.id);
      const au = authById.get(p.id);
      return {
        id: p.id,
        name: p.name ?? (au?.user_metadata?.["name"] as string | undefined) ?? null,
        email: p.email ?? au?.email ?? null,
        role: roleById.get(p.id) ?? "user",
        status: (p.status === "disabled" ? "disabled" : "active") as "active" | "disabled",
        createdAt: p.created_at ?? au?.created_at ?? null,
        lastLoginAt: au?.last_sign_in_at ?? p.last_login_at ?? null,
        lastActivity: p.last_activity ?? st?.last_activity ?? null,
        plan: p.plan ?? "free",
        processingOperations: st?.processing_operations ?? 0,
        invoicesProcessed: st?.invoices_processed ?? 0,
        tempUploads: st?.temp_uploads ?? 0,
        processingRequests: st?.processing_requests ?? 0,
        excelExports: st?.excel_exports ?? 0,
        pdfExports: st?.pdf_exports ?? 0,
      };
    });
  },
);

export type ActivityRow = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
};

export const getUserDetail = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data }): Promise<{ user: AdminUserRow; activity: ActivityRow[] }> => {
    const { assertAdmin, db } = await ctx();
    await assertAdmin();

    const users = await listUsers();
    const user = users.find((u) => u.id === data.userId);
    if (!user) throw new Error("المستخدم غير موجود");

    const { data: logs } = await db
      .from("activity_logs")
      .select("id, action, detail, created_at")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(100);

    return {
      user,
      activity: (logs ?? []).map((l) => ({
        id: l.id,
        action: l.action,
        detail: l.detail,
        createdAt: l.created_at,
      })),
    };
  });

export const createUser = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1).max(120),
        role: z.enum(["user", "admin"]),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { assertAdmin, audit, db } = await ctx();
    const actor = await assertAdmin();

    const { data: created, error } = await db.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "تعذّر إنشاء المستخدم");

    const id = created.user.id;
    await db.from("profiles").upsert({ id, email: data.email, name: data.name });
    await db.from("user_usage_stats").upsert({ user_id: id });
    await db.from("user_roles").delete().eq("user_id", id);
    await db.from("user_roles").insert({ user_id: id, role: data.role });
    await db.from("activity_logs").insert({ user_id: id, action: "account_created" });

    await audit(actor, "admin_created_user", { id, email: data.email }, { role: data.role });
    return { id };
  });

export const setUserStatus = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ userId: z.string().uuid(), disabled: z.boolean() }).parse(i),
  )
  .handler(async ({ data }) => {
    const { assertAdmin, audit, db } = await ctx();
    const actor = await assertAdmin();
    if (actor.id === data.userId && data.disabled) throw new Error("لا يمكنك تعطيل حسابك");

    const { error } = await db.auth.admin.updateUserById(data.userId, {
      ban_duration: data.disabled ? BAN_FOREVER : "none",
    });
    if (error) throw new Error(error.message);

    await db
      .from("profiles")
      .update({ status: data.disabled ? "disabled" : "active" })
      .eq("id", data.userId);

    await audit(
      actor,
      data.disabled ? "admin_disabled_user" : "admin_enabled_user",
      { id: data.userId },
    );
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ userId: z.string().uuid(), role: z.enum(["user", "admin"]) }).parse(i),
  )
  .handler(async ({ data }) => {
    const { assertAdmin, audit, db } = await ctx();
    const actor = await assertAdmin();
    if (actor.id === data.userId && data.role !== "admin")
      throw new Error("لا يمكنك إزالة صلاحيتك كمدير");

    await db.from("user_roles").delete().eq("user_id", data.userId);
    await db.from("user_roles").insert({ user_id: data.userId, role: data.role });
    await audit(actor, "admin_changed_user_role", { id: data.userId }, { role: data.role });
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ userId: z.string().uuid(), redirectTo: z.string().url() }).parse(i),
  )
  .handler(async ({ data }) => {
    const { assertAdmin, audit, db } = await ctx();
    const actor = await assertAdmin();

    const { data: target, error: e1 } = await db.auth.admin.getUserById(data.userId);
    if (e1 || !target.user?.email) throw new Error("لا يوجد بريد لهذا المستخدم");

    const { error } = await db.auth.resetPasswordForEmail(target.user.email, {
      redirectTo: data.redirectTo,
    });
    if (error) throw new Error(error.message);

    await db.from("activity_logs").insert({
      user_id: data.userId,
      action: "password_reset_requested",
      detail: "بواسطة المدير",
    });
    await audit(actor, "admin_initiated_password_reset", {
      id: data.userId,
      email: target.user.email,
    });
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { assertAdmin, audit, db } = await ctx();
    const actor = await assertAdmin();
    if (actor.id === data.userId) throw new Error("لا يمكنك حذف حسابك");

    const { data: target } = await db.auth.admin.getUserById(data.userId);

    // بيانات مرتبطة (الفواتير المحفوظة، الإحصائيات، السجلات، الأدوار)
    await db.from("invoices").delete().eq("user_id", data.userId);
    await db.from("activity_logs").delete().eq("user_id", data.userId);
    await db.from("user_usage_stats").delete().eq("user_id", data.userId);
    await db.from("user_roles").delete().eq("user_id", data.userId);
    await db.from("profiles").delete().eq("id", data.userId);

    const { error } = await db.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    await audit(actor, "admin_deleted_user", {
      id: data.userId,
      email: target.user?.email ?? null,
    });
    return { ok: true };
  });

export type AuditRow = {
  id: string;
  action: string;
  adminEmail: string | null;
  targetUserId: string | null;
  targetEmail: string | null;
  createdAt: string;
};

export const listAuditLog = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuditRow[]> => {
    const { assertAdmin, db } = await ctx();
    await assertAdmin();
    const { data } = await db
      .from("admin_audit_logs")
      .select("id, action, admin_email, target_user_id, target_email, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    return (data ?? []).map((r) => ({
      id: r.id,
      action: r.action,
      adminEmail: r.admin_email,
      targetUserId: r.target_user_id,
      targetEmail: r.target_email,
      createdAt: r.created_at,
    }));
  },
);

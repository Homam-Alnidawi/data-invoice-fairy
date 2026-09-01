// Server-only helpers for admin authorization + audit logging.
// Never import this from client code.
import { currentUser, admin as adminClient } from "./usage.server";

export type AdminIdentity = { id: string; email: string | null };

/** Throws unless the caller is signed in AND has the admin role (checked in the DB). */
export async function assertAdmin(): Promise<AdminIdentity> {
  const user = await currentUser();
  if (!user) throw new Error("Unauthorized");

  const db = await adminClient();
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (error || !data) throw new Error("Forbidden: admin role required");
  return user;
}

export async function isCallerAdmin(): Promise<boolean> {
  try {
    await assertAdmin();
    return true;
  } catch {
    return false;
  }
}

export type AuditExtra = {
  oldPlan?: string | null;
  newPlan?: string | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  durationDays?: number | null;
  reason?: string | null;
};

export async function audit(
  actor: AdminIdentity,
  action: string,
  target?: { id?: string | null; email?: string | null },
  metadata: Record<string, unknown> = {},
  extra: AuditExtra = {},
) {
  const db = await adminClient();
  await db.from("admin_audit_logs").insert({
    admin_id: actor.id,
    admin_email: actor.email,
    action,
    target_user_id: target?.id ?? null,
    target_email: target?.email ?? null,
    metadata: metadata as never,
    old_plan: extra.oldPlan ?? null,
    new_plan: extra.newPlan ?? null,
    old_status: extra.oldStatus ?? null,
    new_status: extra.newStatus ?? null,
    duration_days: extra.durationDays ?? null,
    reason: extra.reason ?? null,
  });
}


export async function logActivity(
  userId: string | null,
  action: string,
  detail?: string | null,
  metadata: Record<string, unknown> = {},
) {
  if (!userId) return;
  const db = await adminClient();
  await db.from("activity_logs").insert({
    user_id: userId,
    action,
    detail: detail ?? null,
    metadata: metadata as never,
  });
}

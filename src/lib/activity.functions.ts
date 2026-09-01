import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ACTIONS = [
  "login",
  "logout",
  "file_upload",
  "excel_export",
  "pdf_export",
  "csv_export",
] as const;

/** تسجيل نشاط المستخدم الحالي (بدون أي بيانات حساسة). */
export const trackActivity = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        action: z.enum(ACTIONS),
        count: z.number().int().min(0).max(5000).optional(),
        detail: z.string().max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { currentUser, admin } = await import("./usage.server");
    const user = await currentUser();
    if (!user) return { ok: true };

    const db = await admin();
    await db.from("activity_logs").insert({
      user_id: user.id,
      action: data.action,
      detail: data.detail ?? null,
      metadata: (data.count ? { count: data.count } : {}) as never,
    });

    if (data.action === "login") {
      await db.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);
    }

    const bump: Record<string, number> = {};
    if (data.action === "file_upload") bump["_temp_uploads"] = data.count ?? 1;
    if (data.action === "excel_export") bump["_excel_exports"] = 1;
    if (data.action === "pdf_export") bump["_pdf_exports"] = 1;
    if (Object.keys(bump).length > 0) {
      await db.rpc("bump_usage", { _user_id: user.id, ...bump } as never);
    }
    return { ok: true };
  });

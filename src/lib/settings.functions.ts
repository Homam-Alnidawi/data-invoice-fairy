import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* ---------------------------------- public --------------------------------- */

/** Public, non-sensitive site settings (safe for anonymous visitors). */
export const getPublicSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { getSystemSettings } = await import("./settings.server");
  return getSystemSettings();
});

/* ----------------------------------- admin --------------------------------- */

export const adminGetSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { assertAdmin } = await import("./admin.server");
  await assertAdmin();
  const { getSystemSettings, getAiSettings, getAiUsageSettings } = await import("./settings.server");
  const { aiConfigStatus } = await import("./ai.server");

  const [system, ai, aiUsage, aiStatus] = await Promise.all([
    getSystemSettings(),
    getAiSettings(),
    getAiUsageSettings(),
    aiConfigStatus(),
  ]);

  return {
    system,
    ai,
    aiUsage,
    // never returns the key itself — only whether one exists server-side
    aiKey: { configured: aiStatus.keyConfigured, envVar: aiStatus.keyEnvVar },
    supabase: {
      url: process.env["SUPABASE_URL"] ?? "",
      anonKeyConfigured: Boolean(process.env["SUPABASE_PUBLISHABLE_KEY"]),
      serviceRoleConfigured: Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]),
    },
  };
});

const SystemSchema = z.object({
  siteName: z.string().trim().min(1).max(80),
  siteDescription: z.string().trim().max(300),
  defaultCurrency: z.string().trim().min(1).max(8),
  defaultLanguage: z.string().trim().min(2).max(8),
  maintenanceMode: z.boolean(),
  allowRegistrations: z.boolean(),
});

export const adminUpdateSystemSettings = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => SystemSchema.parse(i))
  .handler(async ({ data }) => {
    const { assertAdmin, audit } = await import("./admin.server");
    const actor = await assertAdmin();
    const { setSystemSettings, systemLog } = await import("./settings.server");
    await setSystemSettings(data);
    await audit(actor, "SETTINGS_UPDATE_SYSTEM", undefined, { keys: Object.keys(data) });
    await systemLog("settings_updated", {
      detail: "system",
      actorId: actor.id,
      actorEmail: actor.email,
    });
    return { ok: true };
  });

const AiSchema = z.object({
  provider: z.enum(["lovable", "gemini", "openai", "anthropic", "custom"]),
  model: z.string().trim().min(1).max(120),
  baseUrl: z.string().trim().max(300),
  enabled: z.boolean(),
});

export const adminUpdateAiSettings = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AiSchema.parse(i))
  .handler(async ({ data }) => {
    if (data.provider === "custom" && !/^https?:\/\//.test(data.baseUrl)) {
      throw new Error("Custom API يتطلب Base URL صالحًا");
    }
    const { assertAdmin, audit } = await import("./admin.server");
    const actor = await assertAdmin();
    const { setAiSettings, systemLog } = await import("./settings.server");
    // secrets are stored outside the DB, so changing provider/model never touches the key
    await setAiSettings(data);
    await audit(actor, "SETTINGS_UPDATE_AI", undefined, {
      provider: data.provider,
      model: data.model,
      enabled: data.enabled,
    });
    await systemLog("settings_updated", {
      detail: `ai:${data.provider}`,
      actorId: actor.id,
      actorEmail: actor.email,
    });
    return { ok: true };
  });

const AiUsageSchema = z.object({
  defaultMonthlyLimit: z.number().int().min(0).max(1_000_000),
  defaultDailyLimit: z.number().int().min(0).max(1_000_000),
  maxRequestBytes: z.number().int().min(0).max(100_000_000),
  requestTimeoutMs: z.number().int().min(5_000).max(300_000),
});

export const adminUpdateAiUsageSettings = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AiUsageSchema.parse(i))
  .handler(async ({ data }) => {
    const { assertAdmin, audit } = await import("./admin.server");
    const actor = await assertAdmin();
    const { setAiUsageSettings, systemLog } = await import("./settings.server");
    await setAiUsageSettings(data);
    await audit(actor, "SETTINGS_UPDATE_AI_LIMITS", undefined, data);
    await systemLog("settings_updated", {
      detail: "ai_usage",
      actorId: actor.id,
      actorEmail: actor.email,
    });
    return { ok: true };
  });

/* --------------------------------- testing --------------------------------- */

export const adminTestSupabase = createServerFn({ method: "POST" }).handler(async () => {
  const { assertAdmin } = await import("./admin.server");
  const actor = await assertAdmin();
  const { systemLog } = await import("./settings.server");
  const { publicClient } = await import("./usage.server");
  try {
    const { error } = await publicClient().from("plans").select("code").limit(1);
    if (error) throw new Error(error.message);
    await systemLog("supabase_connection_test", {
      detail: "ok",
      actorId: actor.id,
      actorEmail: actor.email,
    });
    return { status: "CONNECTED", message: "Supabase connection successful" };
  } catch {
    await systemLog("supabase_connection_test", {
      level: "error",
      detail: "failed",
      actorId: actor.id,
      actorEmail: actor.email,
    });
    return { status: "ERROR", message: "تعذّر الاتصال بقاعدة البيانات — تحقق من URL والمفتاح" };
  }
});

export const adminTestAi = createServerFn({ method: "POST" }).handler(async () => {
  const { assertAdmin } = await import("./admin.server");
  const actor = await assertAdmin();
  const { testAi } = await import("./ai.server");
  const { systemLog } = await import("./settings.server");
  const result = await testAi();
  await systemLog("ai_connection_test", {
    level: result.status === "CONNECTED" ? "info" : "warn",
    detail: result.status,
    actorId: actor.id,
    actorEmail: actor.email,
  });
  return result;
});

/* ----------------------------- connection status --------------------------- */

export const adminConnectionStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { assertAdmin } = await import("./admin.server");
  await assertAdmin();
  const { admin } = await import("./usage.server");
  const { aiConfigStatus } = await import("./ai.server");

  const db = await admin();
  const check = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return "CONNECTED" as const;
    } catch {
      return "ERROR" as const;
    }
  };

  const database = await check(async () => {
    const { error } = await db.from("plans").select("code").limit(1);
    if (error) throw new Error(error.message);
  });

  const authentication = await check(async () => {
    const { error } = await db.from("profiles").select("id").limit(1);
    if (error) throw new Error(error.message);
  });

  let storage: "CONNECTED" | "NOT_CONFIGURED" | "ERROR" = "NOT_CONFIGURED";
  try {
    const { data, error } = await db.storage.listBuckets();
    if (error) storage = "ERROR";
    else storage = (data?.length ?? 0) > 0 ? "CONNECTED" : "NOT_CONFIGURED";
  } catch {
    storage = "ERROR";
  }

  const cfg = await aiConfigStatus();

  return {
    supabase: process.env["SUPABASE_URL"] ? database : "NOT_CONFIGURED",
    database,
    authentication,
    storage,
    // server functions of this app act as the backend layer (see README)
    serverFunctions: "CONNECTED" as const,
    ai: !cfg.keyConfigured || !cfg.model ? "NOT_CONFIGURED" : cfg.enabled ? "CONFIGURED" : "DISABLED",
  };
});

/* ------------------------------- ai statistics ----------------------------- */

export const adminAiUsageStats = createServerFn({ method: "GET" }).handler(async () => {
  const { assertAdmin } = await import("./admin.server");
  await assertAdmin();
  const { admin } = await import("./usage.server");
  const db = await admin();

  const { data, error } = await db
    .from("ai_usage_events")
    .select("status, input_tokens, output_tokens, total_tokens, estimated_cost, created_at")
    .order("created_at", { ascending: false })
    .limit(10000);

  if (error || !data) return null;
  if (data.length === 0) return null;

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  let successful = 0,
    failed = 0,
    today = 0,
    thisMonth = 0,
    inTok = 0,
    outTok = 0,
    totTok = 0,
    cost = 0;

  for (const r of data) {
    if (r.status === "success") successful++;
    else failed++;
    if (r.created_at >= dayStart) today++;
    if (r.created_at >= monthStart) thisMonth++;
    inTok += r.input_tokens ?? 0;
    outTok += r.output_tokens ?? 0;
    totTok += r.total_tokens ?? 0;
    cost += Number(r.estimated_cost ?? 0);
  }

  return {
    totalRequests: data.length,
    successful,
    failed,
    today,
    thisMonth,
    inputTokens: inTok,
    outputTokens: outTok,
    totalTokens: totTok,
    estimatedCost: cost,
  };
});

/* -------------------------------- system logs ------------------------------ */

export const adminSystemLogs = createServerFn({ method: "GET" }).handler(async () => {
  const { assertAdmin } = await import("./admin.server");
  await assertAdmin();
  const { admin } = await import("./usage.server");
  const db = await admin();
  const { data } = await db
    .from("system_logs")
    .select("id, level, event, detail, actor_email, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((r) => ({
    id: r.id,
    level: r.level,
    event: r.event,
    detail: r.detail,
    actorEmail: r.actor_email,
    createdAt: r.created_at,
  }));
});

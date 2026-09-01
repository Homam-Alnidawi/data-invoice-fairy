// Server-only settings store + system logging.
// Never import from client code.
import { admin, currentUser } from "./usage.server";

export type SystemSettings = {
  siteName: string;
  siteDescription: string;
  defaultCurrency: string;
  defaultLanguage: string;
  maintenanceMode: boolean;
  allowRegistrations: boolean;
};

export type AiProvider = "lovable" | "gemini" | "openai" | "anthropic" | "custom";

export type AiSettings = {
  provider: AiProvider;
  model: string;
  baseUrl: string;
  enabled: boolean;
};

export type AiUsageSettings = {
  defaultMonthlyLimit: number;
  defaultDailyLimit: number;
  maxRequestBytes: number;
  requestTimeoutMs: number;
};

const SYSTEM_DEFAULTS: SystemSettings = {
  siteName: "دفتر",
  siteDescription: "ارفع فواتيرك ودع الذكاء الاصطناعي يستخرج البيانات ويجهّز التقرير.",
  defaultCurrency: "TRY",
  defaultLanguage: "ar",
  maintenanceMode: false,
  allowRegistrations: true,
};

const AI_DEFAULTS: AiSettings = {
  provider: "lovable",
  model: "google/gemini-3.7-flash",
  baseUrl: "",
  enabled: true,
};

const AI_USAGE_DEFAULTS: AiUsageSettings = {
  defaultMonthlyLimit: 1000,
  defaultDailyLimit: 200,
  maxRequestBytes: 12_000_000,
  requestTimeoutMs: 90_000,
};

async function readKey<T>(key: string, fallback: T): Promise<T> {
  const db = await admin();
  const { data } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
  const value = (data as { value?: unknown } | null)?.value;
  if (!value || typeof value !== "object") return fallback;
  return { ...fallback, ...(value as Partial<T>) };
}

async function writeKey(key: string, value: Record<string, unknown>, isPublic: boolean) {
  const db = await admin();
  const user = await currentUser();
  await db
    .from("app_settings")
    .upsert(
      {
        key,
        value: value as never,
        is_public: isPublic,
        updated_by: user?.id ?? null,
      },
      { onConflict: "key" },
    );
}

export const getSystemSettings = () => readKey<SystemSettings>("system", SYSTEM_DEFAULTS);
export const getAiSettings = () => readKey<AiSettings>("ai", AI_DEFAULTS);
export const getAiUsageSettings = () => readKey<AiUsageSettings>("ai_usage", AI_USAGE_DEFAULTS);

export const setSystemSettings = (s: SystemSettings) => writeKey("system", { ...s }, true);
export const setAiSettings = (s: AiSettings) => writeKey("ai", { ...s }, false);
export const setAiUsageSettings = (s: AiUsageSettings) => writeKey("ai_usage", { ...s }, false);

/** Records an important system event. Never pass secrets in `detail`/`metadata`. */
export async function systemLog(
  event: string,
  opts: {
    level?: "info" | "warn" | "error";
    detail?: string | null;
    actorId?: string | null;
    actorEmail?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
) {
  try {
    const db = await admin();
    await db.from("system_logs").insert({
      event,
      level: opts.level ?? "info",
      detail: opts.detail ?? null,
      actor_id: opts.actorId ?? null,
      actor_email: opts.actorEmail ?? null,
      metadata: (opts.metadata ?? {}) as never,
    });
  } catch {
    // logging must never break the request
  }
}

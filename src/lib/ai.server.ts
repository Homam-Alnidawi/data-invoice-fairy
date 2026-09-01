// Server-only AI provider router.
// The API key NEVER leaves the server: it is read from environment secrets here.
import { admin, currentUser } from "./usage.server";
import { getAiSettings, getAiUsageSettings, systemLog, type AiProvider } from "./settings.server";

export type MediaPart =
  | { kind: "image"; dataUrl: string }
  | { kind: "file"; fileName: string; dataUrl: string };

export class AiError extends Error {
  code:
    | "NOT_CONFIGURED"
    | "DISABLED"
    | "INVALID_KEY"
    | "MODEL_UNAVAILABLE"
    | "PROVIDER_UNAVAILABLE"
    | "RATE_LIMITED"
    | "PAYMENT_REQUIRED"
    | "LIMIT_REACHED"
    | "REQUEST_TOO_LARGE"
    | "REQUEST_FAILED";
  constructor(code: AiError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** Which env var holds the secret for a provider. */
export function keyEnvVar(provider: AiProvider): string {
  return provider === "lovable" ? "LOVABLE_API_KEY" : "AI_API_KEY";
}

function providerKey(provider: AiProvider): string | undefined {
  const env = process.env;
  if (provider === "lovable") return env["LOVABLE_API_KEY"];
  return (
    env["AI_API_KEY"] ||
    (provider === "gemini" ? env["GEMINI_API_KEY"] : undefined) ||
    (provider === "openai" ? env["OPENAI_API_KEY"] : undefined) ||
    (provider === "anthropic" ? env["ANTHROPIC_API_KEY"] : undefined)
  );
}

function defaultBaseUrl(provider: AiProvider): string {
  switch (provider) {
    case "lovable":
      return "https://ai.gateway.lovable.dev/v1";
    case "openai":
      return "https://api.openai.com/v1";
    case "gemini":
      return "https://generativelanguage.googleapis.com/v1beta/openai";
    case "anthropic":
      return "https://api.anthropic.com/v1";
    default:
      return "";
  }
}

export async function aiConfigStatus() {
  const settings = await getAiSettings();
  const envProvider = process.env["AI_PROVIDER"] as AiProvider | undefined;
  const provider = (settings.provider || envProvider || "lovable") as AiProvider;
  return {
    provider,
    model: settings.model || process.env["AI_MODEL"] || "",
    baseUrl: settings.baseUrl || process.env["AI_BASE_URL"] || defaultBaseUrl(provider),
    enabled: settings.enabled,
    keyConfigured: Boolean(providerKey(provider)),
    keyEnvVar: keyEnvVar(provider),
  };
}

function splitDataUrl(dataUrl: string) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  return { mediaType: m?.[1] ?? "application/octet-stream", base64: m?.[2] ?? "" };
}

function mapHttpError(status: number, body: string): AiError {
  if (status === 401 || status === 403) return new AiError("INVALID_KEY", "مفتاح الذكاء الاصطناعي غير صالح");
  if (status === 404) return new AiError("MODEL_UNAVAILABLE", "الموديل المحدد غير متاح لدى المزوّد");
  if (status === 429) return new AiError("RATE_LIMITED", "تم تجاوز حد الطلبات لدى المزوّد");
  if (status === 402) return new AiError("PAYMENT_REQUIRED", "رصيد مزوّد الذكاء الاصطناعي غير كافٍ");
  if (status >= 500) return new AiError("PROVIDER_UNAVAILABLE", "مزوّد الذكاء الاصطناعي غير متاح حاليًا");
  const hint = body.slice(0, 120).replace(/[A-Za-z0-9_\-]{24,}/g, "***");
  return new AiError("REQUEST_FAILED", `فشل الطلب (${status}) ${hint}`);
}

type CallResult = { text: string; inputTokens: number; outputTokens: number };

async function callProvider(opts: {
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  userText: string;
  media?: MediaPart | undefined;
  timeoutMs: number;
}): Promise<CallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    if (opts.provider === "anthropic") {
      const content: unknown[] = [{ type: "text", text: opts.userText }];
      if (opts.media) {
        const { mediaType, base64 } = splitDataUrl(opts.media.dataUrl);
        content.push(
          mediaType === "application/pdf"
            ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } }
            : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        );
      }
      const res = await fetch(`${opts.baseUrl}/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: 4096,
          system: opts.system,
          messages: [{ role: "user", content }],
        }),
      });
      if (!res.ok) throw mapHttpError(res.status, await res.text());
      const json = (await res.json()) as {
        content?: Array<{ text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      return {
        text: (json.content ?? []).map((c) => c.text ?? "").join(""),
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      };
    }

    // OpenAI-compatible (lovable / openai / gemini / custom)
    const content: unknown[] = [{ type: "text", text: opts.userText }];
    if (opts.media) {
      content.push(
        opts.media.kind === "file"
          ? { type: "file", file: { filename: opts.media.fileName, file_data: opts.media.dataUrl } }
          : { type: "image_url", image_url: { url: opts.media.dataUrl } },
      );
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.provider === "lovable") headers["Lovable-API-Key"] = opts.apiKey;
    else headers["Authorization"] = `Bearer ${opts.apiKey}`;

    const res = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content },
        ],
      }),
    });
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: json.choices?.[0]?.message?.content ?? "",
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  } catch (e) {
    if (e instanceof AiError) throw e;
    if ((e as Error)?.name === "AbortError")
      throw new AiError("REQUEST_FAILED", "انتهت مهلة الطلب لدى مزوّد الذكاء الاصطناعي");
    throw new AiError("PROVIDER_UNAVAILABLE", "تعذّر الاتصال بمزوّد الذكاء الاصطناعي");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs an AI request end-to-end: settings -> server-side limits (atomic) ->
 * provider call -> usage recording. All limits are enforced here, never in the UI.
 */
export async function runAi(opts: {
  system: string;
  userText: string;
  media?: MediaPart | undefined;
}): Promise<string> {
  const cfg = await aiConfigStatus();
  if (!cfg.enabled) throw new AiError("DISABLED", "خدمة الذكاء الاصطناعي معطّلة حاليًا");
  const apiKey = providerKey(cfg.provider);
  if (!apiKey || !cfg.model || !cfg.baseUrl)
    throw new AiError("NOT_CONFIGURED", "مزوّد الذكاء الاصطناعي غير مهيأ");

  const limits = await getAiUsageSettings();
  const size = (opts.media?.dataUrl.length ?? 0) + opts.userText.length;
  if (limits.maxRequestBytes > 0 && size > limits.maxRequestBytes)
    throw new AiError("REQUEST_TOO_LARGE", "حجم الملف أكبر من الحد المسموح");

  const db = await admin();
  const user = await currentUser();

  const { data: quota, error: quotaErr } = await db.rpc("consume_ai_quota", {
    _user_id: user?.id ?? null,
    _daily_limit: limits.defaultDailyLimit,
    _monthly_limit: limits.defaultMonthlyLimit,
  } as never);
  if (quotaErr) throw new AiError("REQUEST_FAILED", "تعذّر التحقق من حد استخدام الذكاء الاصطناعي");
  const q = quota as unknown as { allowed: boolean; scope: string; used: number; limit: number };
  if (!q.allowed)
    throw new AiError(
      "LIMIT_REACHED",
      `تم بلوغ حد استخدام الذكاء الاصطناعي (${q.used}/${q.limit})`,
    );

  const record = async (status: string, inTok = 0, outTok = 0, code?: string) => {
    await db
      .rpc("record_ai_result", {
        _user_id: user?.id ?? null,
        _provider: cfg.provider,
        _model: cfg.model,
        _status: status,
        _input_tokens: inTok,
        _output_tokens: outTok,
        _estimated_cost: 0,
        _error_code: code ?? null,
      } as never)
      .then(() => undefined, () => undefined);
  };

  try {
    const out = await callProvider({
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      apiKey,
      model: cfg.model,
      system: opts.system,
      userText: opts.userText,
      media: opts.media,
      timeoutMs: limits.requestTimeoutMs || 90_000,
    });
    await record("success", out.inputTokens, out.outputTokens);
    return out.text;
  } catch (e) {
    const code = e instanceof AiError ? e.code : "REQUEST_FAILED";
    await record("failed", 0, 0, code);
    await systemLog("ai_request_failed", { level: "error", detail: code });
    throw e;
  }
}

/** Lightweight connectivity probe used by the admin "Test AI Connection" button. */
export async function testAi(): Promise<{ status: string; message: string }> {
  const cfg = await aiConfigStatus();
  if (!cfg.keyConfigured || !cfg.model || !cfg.baseUrl)
    return { status: "NOT_CONFIGURED", message: "لم يتم إعداد المزوّد أو المفتاح بعد" };
  if (!cfg.enabled) return { status: "DISABLED", message: "الذكاء الاصطناعي معطّل من الإعدادات" };
  try {
    await callProvider({
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      apiKey: providerKey(cfg.provider)!,
      model: cfg.model,
      system: "Reply with the single word: ok",
      userText: "ping",
      timeoutMs: 20_000,
    });
    return { status: "CONNECTED", message: "تم الاتصال بمزوّد الذكاء الاصطناعي بنجاح" };
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("REQUEST_FAILED", "فشل الطلب");
    return { status: err.code, message: err.message };
  }
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Types (لا تحتوي أبدًا على قيم سرّية)                                 */
/* ------------------------------------------------------------------ */

export type ProviderFieldView = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
  hint?: string;
  configured: boolean;
  /** القيم العامة فقط. الأسرار دائمًا null. */
  value: string | null;
};

export type ProviderView = {
  id: string;
  displayName: string;
  doc: string;
  environments: { value: string; label: string }[];
  environment: string;
  currency: string;
  enabled: boolean;
  status: "not_configured" | "configured" | "enabled" | "disabled" | "error";
  complete: boolean;
  fields: ProviderFieldView[];
  supportsConnectionTest: boolean;
  callbackKind: "webhook" | "callback";
  webhookUrl: string;
  recurring: boolean;
  notes?: string;
  lastError: string | null;
  lastTestedAt: string | null;
};

export type PublicProvider = {
  id: string;
  displayName: string;
  environment: string;
  currency: string;
  recurring: boolean;
  /** إعدادات عامة مسموح بها رسميًا في الواجهة فقط. */
  publicConfig: Record<string, string>;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function originOf(): string {
  return "https://data-invoice-fairy.lovable.app";
}

async function core() {
  const store = await import("./payment-providers.server");
  const { assertAdmin, audit } = await import("./admin.server");
  const { admin } = await import("./usage.server");
  return { store, assertAdmin, audit, db: await admin() };
}

async function buildView(
  store: typeof import("./payment-providers.server"),
  def: import("./payment-providers.server").ProviderDef,
  origin: string,
): Promise<ProviderView> {
  const row = await store.readSettings(def.id);
  const { environment, fields, complete } = await store.completeness(def, row);
  const enabled = row?.enabled ?? false;
  const lastError = row?.last_error ?? null;
  let status = store.computeStatus({ complete, enabled, lastError });
  if (complete && !enabled && !lastError && row) status = "disabled";
  return {
    id: def.id,
    displayName: row?.display_name ?? def.displayName,
    doc: def.doc,
    environments: def.environments,
    environment,
    currency: row?.currency ?? def.defaultCurrency,
    enabled,
    status,
    complete,
    fields: def.fields.map((f) => {
      const s = fields.find((x) => x.key === f.key)!;
      return {
        key: f.key,
        label: f.label,
        secret: f.secret,
        required: f.required,
        ...(f.placeholder ? { placeholder: f.placeholder } : {}),
        ...(f.hint ? { hint: f.hint } : {}),
        configured: s.configured,
        value: s.value,
      };
    }),
    supportsConnectionTest: def.supportsConnectionTest,
    callbackKind: def.callbackKind,
    webhookUrl: `${origin}${def.webhookPath}`,
    recurring: def.recurring,
    ...(def.notes ? { notes: def.notes } : {}),
    lastError,
    lastTestedAt: row?.last_tested_at ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Admin: list                                                         */
/* ------------------------------------------------------------------ */

export const adminListPaymentProviders = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProviderView[]> => {
    const { store, assertAdmin } = await core();
    await assertAdmin();
    const origin = originOf();
    return Promise.all(store.PROVIDERS.map((def) => buildView(store, def, origin)));
  },
);

/* ------------------------------------------------------------------ */
/* Admin: save configuration (public config + secrets)                 */
/* ------------------------------------------------------------------ */

export const adminSavePaymentProvider = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        provider: z.string().min(1).max(32),
        environment: z.string().min(1).max(32),
        currency: z.string().min(2).max(8).optional(),
        /** القيم العامة فقط */
        config: z.record(z.string(), z.string().max(500)).default({}),
        /** الأسرار الجديدة فقط — الفراغ يعني "لا تغيّر" */
        secrets: z.record(z.string(), z.string().max(2000)).default({}),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<ProviderView> => {
    const { store, assertAdmin, audit, db } = await core();
    const actor = await assertAdmin();

    const def = store.getProviderDef(data.provider);
    if (!def) throw new Error("مزوّد غير معروف");
    if (!def.environments.some((e) => e.value === data.environment))
      throw new Error("بيئة غير صالحة");

    const existing = await store.readSettings(def.id);
    const prevEnv = existing?.environment ?? def.environments[0]!.value;

    // القيم العامة فقط تدخل الجدول، مفصولة حسب البيئة
    const publicKeys = new Set(def.fields.filter((f) => !f.secret).map((f) => f.key));
    const cfg: Record<string, string> = { ...(existing?.config ?? {}) };
    for (const [k, v] of Object.entries(data.config)) {
      if (!publicKeys.has(k)) continue;
      cfg[`${data.environment}:${k}`] = v.trim();
      cfg[k] = v.trim();
    }

    const { error } = await db.from("payment_provider_settings").upsert(
      {
        provider: def.id,
        display_name: def.displayName,
        environment: data.environment,
        currency: data.currency ?? existing?.currency ?? def.defaultCurrency,
        config: cfg as never,
        last_error: null,
        // تغيير البيئة أو البيانات لا يفعّل شيئًا تلقائيًا
        enabled: existing?.enabled && prevEnv === data.environment ? true : false,
      } as never,
      { onConflict: "provider" },
    );
    if (error) throw new Error("تعذّر حفظ الإعدادات");

    // الأسرار: تُخزَّن مشفّرة لكل بيئة على حدة
    const secretKeys = new Set(def.fields.filter((f) => f.secret).map((f) => f.key));
    const updatedSecrets: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(data.secrets)) {
      if (!secretKeys.has(k) || !v.trim()) continue;
      await store.putSecret(def.id, data.environment, k, v.trim(), actor.id);
      updatedSecrets[`${k}_updated`] = true; // لا تُسجَّل القيمة أبدًا
    }

    await audit(actor, "payment_provider_updated", undefined, {
      provider: def.id,
      environment: data.environment,
      ...updatedSecrets,
    });

    return buildView(store, def, originOf());
  });

/* ------------------------------------------------------------------ */
/* Admin: enable / disable                                             */
/* ------------------------------------------------------------------ */

export const adminSetPaymentProviderEnabled = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ provider: z.string().min(1).max(32), enabled: z.boolean() }).parse(i),
  )
  .handler(async ({ data }): Promise<ProviderView> => {
    const { store, assertAdmin, audit, db } = await core();
    const actor = await assertAdmin();

    const def = store.getProviderDef(data.provider);
    if (!def) throw new Error("مزوّد غير معروف");

    const row = await store.readSettings(def.id);
    if (data.enabled) {
      const { complete } = await store.completeness(def, row);
      // التحقق النهائي على الخادم — لا يُعتمد على الواجهة
      if (!complete) throw new Error("لا يمكن التفعيل: الإعدادات غير مكتملة");
    }

    const { error } = await db.from("payment_provider_settings").upsert(
      {
        provider: def.id,
        display_name: row?.display_name ?? def.displayName,
        environment: row?.environment ?? def.environments[0]!.value,
        currency: row?.currency ?? def.defaultCurrency,
        enabled: data.enabled,
      } as never,
      { onConflict: "provider" },
    );
    if (error) throw new Error("تعذّر تحديث الحالة");

    await audit(actor, data.enabled ? "payment_provider_enabled" : "payment_provider_disabled", undefined, {
      provider: def.id,
      environment: row?.environment ?? def.environments[0]!.value,
    });

    return buildView(store, def, originOf());
  });

/* ------------------------------------------------------------------ */
/* Admin: test connection                                              */
/* ------------------------------------------------------------------ */

export const adminTestPaymentProvider = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ provider: z.string().min(1).max(32) }).parse(i))
  .handler(async ({ data }) => {
    const { store, assertAdmin, audit, db } = await core();
    const actor = await assertAdmin();

    const def = store.getProviderDef(data.provider);
    if (!def) throw new Error("مزوّد غير معروف");

    const row = await store.readSettings(def.id);
    const environment = row?.environment ?? def.environments[0]!.value;
    const result = await store.testConnection(def.id, environment);

    if (result.supported) {
      await db
        .from("payment_provider_settings")
        .update({
          last_tested_at: new Date().toISOString(),
          last_error: result.ok ? null : result.message,
        } as never)
        .eq("provider", def.id);
    }

    await audit(actor, "payment_provider_tested", undefined, {
      provider: def.id,
      environment,
      supported: result.supported,
      ok: result.ok,
    });

    return result;
  });

/* ------------------------------------------------------------------ */
/* Public: المزوّدون المتاحون للمستخدم (مفعّل + مكتمل الإعداد فقط)      */
/* ------------------------------------------------------------------ */

export const listAvailablePaymentProviders = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicProvider[]> => {
    const store = await import("./payment-providers.server");
    const rows = await store.readAllSettings();
    const out: PublicProvider[] = [];
    for (const def of store.PROVIDERS) {
      const row = rows.find((r) => r.provider === def.id) ?? null;
      if (!row?.enabled) continue;
      const { complete, environment, fields } = await store.completeness(def, row);
      if (!complete) continue;
      const publicConfig: Record<string, string> = {};
      for (const f of fields) if (!f.secret && f.value) publicConfig[f.key] = f.value;
      out.push({
        id: def.id,
        displayName: row.display_name ?? def.displayName,
        environment,
        currency: row.currency ?? def.defaultCurrency,
        recurring: def.recurring,
        publicConfig,
      });
    }
    return out;
  },
);

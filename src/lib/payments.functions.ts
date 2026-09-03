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

export type EnvironmentView = {
  value: string;
  label: string;
  complete: boolean;
  fields: ProviderFieldView[];
  testStatus: "passed" | "failed" | "not_tested" | "unsupported";
  lastTestedAt: string | null;
  testMessage: string | null;
  canEnable: boolean;
  enableBlockedReason: string | null;
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
  /** كل بيئة معزولة تمامًا: إعداداتها ونتيجة اختبارها وحالتها. */
  environmentViews: EnvironmentView[];
  testStatus: "passed" | "failed" | "not_tested" | "unsupported";
  canEnable: boolean;
  enableBlockedReason: string | null;
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

/** أصل الموقع — من متغيّر بيئة APP_URL/PUBLIC_BASE_URL أو من رأس الطلب الحالي. */
async function originOf(): Promise<string> {
  const store = await import("./payment-providers.server");
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  return store.appBaseUrl(request ?? undefined);
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
  const environment = row?.environment ?? def.environments[0]!.value;

  const environmentViews: EnvironmentView[] = [];
  for (const e of def.environments) {
    const { fields, complete } = await store.completeness(def, row, e.value);
    const t = store.readTestResult(row, e.value);
    const gate = await store.canEnable(def, row, e.value);
    environmentViews.push({
      value: e.value,
      label: e.label,
      complete,
      fields: fields.map((s2) => {
        const f = def.fields.find((x) => x.key === s2.key)!;
        return {
          key: f.key,
          label: f.label,
          secret: f.secret,
          required: f.required,
          ...(f.placeholder ? { placeholder: f.placeholder } : {}),
          ...(f.hint ? { hint: f.hint } : {}),
          configured: s2.configured,
          value: s2.value,
        };
      }),
      testStatus: !def.supportsConnectionTest
        ? "unsupported"
        : t
          ? t.ok
            ? "passed"
            : "failed"
          : "not_tested",
      lastTestedAt: t?.at ?? null,
      testMessage: t?.message ?? null,
      canEnable: gate.ok,
      enableBlockedReason: gate.reason ?? null,
    });
  }

  const current = environmentViews.find((e) => e.value === environment) ?? environmentViews[0]!;
  const enabled = row?.enabled ?? false;
  const lastError = row?.last_error ?? null;
  let status = store.computeStatus({ complete: current.complete, enabled, lastError });
  if (current.complete && !enabled && !lastError && row) status = "disabled";

  return {
    id: def.id,
    displayName: row?.display_name ?? def.displayName,
    doc: def.doc,
    environments: def.environments,
    environment,
    currency: row?.currency ?? def.defaultCurrency,
    enabled,
    status,
    complete: current.complete,
    fields: current.fields,
    environmentViews,
    testStatus: current.testStatus,
    canEnable: current.canEnable,
    enableBlockedReason: current.enableBlockedReason,
    supportsConnectionTest: def.supportsConnectionTest,
    callbackKind: def.callbackKind,
    webhookUrl: def.webhookPath ? `${origin}${def.webhookPath}` : "",
    recurring: def.recurring,
    ...(def.notes ? { notes: def.notes } : {}),
    lastError,
    lastTestedAt: current.lastTestedAt ?? row?.last_tested_at ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Admin: list                                                         */
/* ------------------------------------------------------------------ */

export const adminListPaymentProviders = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProviderView[]> => {
    const { store, assertAdmin } = await core();
    await assertAdmin();
    const origin = await originOf();
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
      // عزل كامل حسب البيئة — لا مفاتيح عامة مشتركة
      cfg[`${data.environment}:${k}`] = v.trim();
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

    return buildView(store, def, await originOf());
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
    const environment = row?.environment ?? def.environments[0]!.value;
    if (data.enabled) {
      // التحقق النهائي على الخادم — لا يُعتمد على الواجهة إطلاقًا
      const gate = await store.canEnable(def, row, environment);
      if (!gate.ok) throw new Error(`لا يمكن التفعيل: ${gate.reason}`);
    }

    const { error } = await db.from("payment_provider_settings").upsert(
      {
        provider: def.id,
        display_name: row?.display_name ?? def.displayName,
        environment,
        currency: row?.currency ?? def.defaultCurrency,
        enabled: data.enabled,
      } as never,
      { onConflict: "provider" },
    );
    if (error) throw new Error("تعذّر تحديث الحالة");

    await audit(actor, data.enabled ? "payment_provider_enabled" : "payment_provider_disabled", undefined, {
      provider: def.id,
      environment,
    });

    return buildView(store, def, await originOf());
  });

/* ------------------------------------------------------------------ */
/* Admin: test connection                                              */
/* ------------------------------------------------------------------ */

export const adminTestPaymentProvider = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        provider: z.string().min(1).max(32),
        environment: z.string().min(1).max(32).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { store, assertAdmin, audit } = await core();
    const actor = await assertAdmin();

    const def = store.getProviderDef(data.provider);
    if (!def) throw new Error("مزوّد غير معروف");

    const row = await store.readSettings(def.id);
    const environment = data.environment ?? row?.environment ?? def.environments[0]!.value;
    if (!def.environments.some((e) => e.value === environment))
      throw new Error("بيئة غير صالحة");

    const result = await store.testConnection(def.id, environment);

    // النتيجة تُحفظ لكل بيئة على حدة؛ الفشل يعطّل البوابة فورًا.
    if (result.supported) await store.recordTestResult(def.id, environment, result);

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
      const gate = await store.canEnable(def, row, environment);
      if (!gate.ok) continue;

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

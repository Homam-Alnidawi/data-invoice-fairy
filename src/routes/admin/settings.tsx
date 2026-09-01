import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { listAuditLog } from "@/lib/admin.functions";
import { adminExpireDue, adminListPlans, adminUpdatePlan } from "@/lib/subscriptions.functions";
import {
  adminAiUsageStats,
  adminConnectionStatus,
  adminGetSettings,
  adminSystemLogs,
  adminTestAi,
  adminTestSupabase,
  adminUpdateAiSettings,
  adminUpdateAiUsageSettings,
  adminUpdateSystemSettings,
} from "@/lib/settings.functions";

export const Route = createFileRoute("/admin/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الإعدادات ومركز التحكم — دفتر" },
      {
        name: "description",
        content: "إعدادات النظام، مزوّد الذكاء الاصطناعي، حالة الاتصال، الخطط وسجل التدقيق.",
      },
      { property: "og:title", content: "الإعدادات ومركز التحكم — دفتر" },
      { property: "og:description", content: "مركز إعدادات آمن للنظام والذكاء الاصطناعي والخطط." },
    ],
  }),
  component: SettingsPage,
});

const fmt = (v: string) => new Date(v).toLocaleString("ar-EG");
const num = (n: number) => n.toLocaleString("ar-EG");

type Draft = { priceCents: string; invoiceLimit: string; processingLimit: string };

/* --------------------------------- shared UI -------------------------------- */

function Section({
  title,
  hint,
  children,
  action,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">{title}</h2>
        {action}
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-60";

function StatusPill({ value }: { value: string }) {
  const tone =
    value === "CONNECTED" || value === "CONFIGURED"
      ? "bg-emerald-500/15 text-emerald-600"
      : value === "NOT_CONFIGURED" || value === "DISABLED"
        ? "bg-muted text-muted-foreground"
        : "bg-destructive/15 text-destructive";
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${tone}`} dir="ltr">
      {value.replace(/_/g, " ")}
    </span>
  );
}

/* ---------------------------------- page ----------------------------------- */

function SettingsPage() {
  const qc = useQueryClient();
  const auditFn = useServerFn(listAuditLog);
  const plansFn = useServerFn(adminListPlans);
  const updateFn = useServerFn(adminUpdatePlan);
  const expireFn = useServerFn(adminExpireDue);

  const settingsFn = useServerFn(adminGetSettings);
  const statusFn = useServerFn(adminConnectionStatus);
  const statsFn = useServerFn(adminAiUsageStats);
  const logsFn = useServerFn(adminSystemLogs);
  const testDbFn = useServerFn(adminTestSupabase);
  const testAiFn = useServerFn(adminTestAi);
  const saveSystemFn = useServerFn(adminUpdateSystemSettings);
  const saveAiFn = useServerFn(adminUpdateAiSettings);
  const saveAiUsageFn = useServerFn(adminUpdateAiUsageSettings);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => auditFn(),
    retry: false,
  });
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => plansFn(), retry: false });
  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => settingsFn(),
    retry: false,
  });
  const status = useQuery({
    queryKey: ["admin-connection-status"],
    queryFn: () => statusFn(),
    retry: false,
  });
  const stats = useQuery({ queryKey: ["admin-ai-stats"], queryFn: () => statsFn(), retry: false });
  const logs = useQuery({ queryKey: ["admin-system-logs"], queryFn: () => logsFn(), retry: false });

  /* ------------------------------ local drafts ------------------------------ */
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [sys, setSys] = useState({
    siteName: "",
    siteDescription: "",
    defaultCurrency: "",
    defaultLanguage: "",
    maintenanceMode: false,
    allowRegistrations: true,
  });
  const [ai, setAi] = useState({
    provider: "lovable" as "lovable" | "gemini" | "openai" | "anthropic" | "custom",
    model: "",
    baseUrl: "",
    enabled: true,
  });
  const [aiLimits, setAiLimits] = useState({
    defaultMonthlyLimit: "0",
    defaultDailyLimit: "0",
    maxRequestBytes: "0",
    requestTimeoutMs: "0",
  });
  const [showAnon, setShowAnon] = useState(false);
  const [dbTest, setDbTest] = useState<{ status: string; message: string } | null>(null);
  const [aiTest, setAiTest] = useState<{ status: string; message: string } | null>(null);

  useEffect(() => {
    if (!plans.data) return;
    setDrafts(
      Object.fromEntries(
        plans.data.map((p) => [
          p.code,
          {
            priceCents: String(p.priceCents),
            invoiceLimit: String(p.invoiceLimit),
            processingLimit: String(p.processingLimit),
          },
        ]),
      ),
    );
  }, [plans.data]);

  useEffect(() => {
    if (!settings.data) return;
    setSys(settings.data.system);
    setAi(settings.data.ai);
    setAiLimits({
      defaultMonthlyLimit: String(settings.data.aiUsage.defaultMonthlyLimit),
      defaultDailyLimit: String(settings.data.aiUsage.defaultDailyLimit),
      maxRequestBytes: String(settings.data.aiUsage.maxRequestBytes),
      requestTimeoutMs: String(settings.data.aiUsage.requestTimeoutMs),
    });
  }, [settings.data]);

  /* -------------------------------- mutations ------------------------------- */
  const save = useMutation({
    mutationFn: (code: string) => {
      const d = drafts[code]!;
      return updateFn({
        data: {
          code,
          priceCents: Number(d.priceCents),
          invoiceLimit: Number(d.invoiceLimit),
          processingLimit: Number(d.processingLimit),
        },
      });
    },
    onSuccess: () => {
      toast.success("تم تحديث الخطة");
      void qc.invalidateQueries({ queryKey: ["admin-plans"] });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const expire = useMutation({
    mutationFn: () => expireFn(),
    onSuccess: (r) => toast.success(`تم فحص الاشتراكات — ${r.expired} انتهت`),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSystem = useMutation({
    mutationFn: () => saveSystemFn({ data: sys }),
    onSuccess: () => {
      toast.success("تم حفظ إعدادات النظام");
      void qc.invalidateQueries({ queryKey: ["admin-settings"] });
      void qc.invalidateQueries({ queryKey: ["admin-system-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAi = useMutation({
    mutationFn: () => saveAiFn({ data: ai }),
    onSuccess: () => {
      toast.success("تم حفظ إعدادات الذكاء الاصطناعي");
      void qc.invalidateQueries({ queryKey: ["admin-settings"] });
      void qc.invalidateQueries({ queryKey: ["admin-connection-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveLimits = useMutation({
    mutationFn: () =>
      saveAiUsageFn({
        data: {
          defaultMonthlyLimit: Number(aiLimits.defaultMonthlyLimit),
          defaultDailyLimit: Number(aiLimits.defaultDailyLimit),
          maxRequestBytes: Number(aiLimits.maxRequestBytes),
          requestTimeoutMs: Number(aiLimits.requestTimeoutMs),
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ حدود الاستخدام");
      void qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testDb = useMutation({
    mutationFn: () => testDbFn(),
    onSuccess: (r) => {
      setDbTest(r);
      if (r.status === "CONNECTED") toast.success(r.message);
      else toast.error(r.message);
      void qc.invalidateQueries({ queryKey: ["admin-connection-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testAi = useMutation({
    mutationFn: () => testAiFn(),
    onSuccess: (r) => {
      setAiTest(r);
      if (r.status === "CONNECTED") toast.success(r.message);
      else toast.error(r.message);
      void qc.invalidateQueries({ queryKey: ["admin-system-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = settings.data;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">Settings</h1>

      {settings.isError && (
        <p className="rounded-lg bg-destructive/10 p-3 text-[12px] text-destructive">
          تعذّر تحميل الإعدادات — تأكد أن حسابك يملك صلاحية الإدارة.
        </p>
      )}

      {/* ------------------------- Connection Status ------------------------- */}
      <Section
        title="Connection Status"
        hint="الحالة تُقرأ فعليًا من الخادم — لا توجد بيانات وهمية."
        action={
          <button
            onClick={() => void qc.invalidateQueries({ queryKey: ["admin-connection-status"] })}
            className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold"
          >
            تحديث
          </button>
        }
      >
        {status.isLoading && <p className="text-[12px] text-muted-foreground">جارٍ الفحص…</p>}
        {status.data && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Supabase", status.data.supabase],
              ["Database", status.data.database],
              ["Authentication", status.data.authentication],
              ["Storage", status.data.storage],
              ["Server Functions", status.data.serverFunctions],
              ["AI Provider", status.data.ai],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <span className="text-[12px] font-bold">{label}</span>
                <StatusPill value={String(value)} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ------------------------------ Supabase ----------------------------- */}
      <Section
        title="Supabase"
        hint="الـ Service Role Key لا يُعرض هنا أبدًا ولا يصل إلى المتصفح — يبقى في أسرار الخادم."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supabase URL">
            <input readOnly dir="ltr" className={inputCls} value={s?.supabase.url ?? ""} />
          </Field>
          <Field label="Supabase Anon / Publishable Key">
            <div className="flex gap-2">
              <input
                readOnly
                dir="ltr"
                type={showAnon ? "text" : "password"}
                className={inputCls}
                value={
                  s?.supabase.anonKeyConfigured
                    ? (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "configured")
                    : ""
                }
              />
              <button
                type="button"
                onClick={() => setShowAnon((v) => !v)}
                className="rounded-lg border border-border px-2"
                aria-label={showAnon ? "إخفاء" : "إظهار"}
              >
                {showAnon ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => testDb.mutate()}
            disabled={testDb.isPending}
            className="rounded-lg bg-foreground px-3 py-2 text-[12px] font-bold text-background disabled:opacity-60"
          >
            {testDb.isPending ? "جارٍ الاختبار…" : "Test Supabase Connection"}
          </button>
          {dbTest && <StatusPill value={dbTest.status} />}
          {dbTest && <span className="text-[12px] text-muted-foreground">{dbTest.message}</span>}
          <span className="text-[11px] text-muted-foreground">
            Service Role: {s?.supabase.serviceRoleConfigured ? "Configured (server-only)" : "Not Configured"}
          </span>
        </div>
      </Section>

      {/* --------------------------- System Settings -------------------------- */}
      <Section title="System Settings" hint="تُحفظ في قاعدة البيانات ويستخدمها النظام فعليًا.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Site Name">
            <input
              className={inputCls}
              value={sys.siteName}
              onChange={(e) => setSys({ ...sys, siteName: e.target.value })}
            />
          </Field>
          <Field label="Site Description">
            <input
              className={inputCls}
              value={sys.siteDescription}
              onChange={(e) => setSys({ ...sys, siteDescription: e.target.value })}
            />
          </Field>
          <Field label="Default Currency">
            <input
              dir="ltr"
              className={inputCls}
              value={sys.defaultCurrency}
              onChange={(e) => setSys({ ...sys, defaultCurrency: e.target.value })}
            />
          </Field>
          <Field label="Default Language">
            <select
              dir="ltr"
              className={inputCls}
              value={sys.defaultLanguage}
              onChange={(e) => setSys({ ...sys, defaultLanguage: e.target.value })}
            >
              <option value="ar">ar</option>
              <option value="en">en</option>
              <option value="tr">tr</option>
            </select>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={sys.maintenanceMode}
              onChange={(e) => setSys({ ...sys, maintenanceMode: e.target.checked })}
            />
            Maintenance Mode
          </label>
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={sys.allowRegistrations}
              onChange={(e) => setSys({ ...sys, allowRegistrations: e.target.checked })}
            />
            Allow New Registrations
          </label>
        </div>
        <button
          onClick={() => saveSystem.mutate()}
          disabled={saveSystem.isPending || !sys.siteName.trim()}
          className="mt-3 rounded-lg bg-foreground px-3 py-2 text-[12px] font-bold text-background disabled:opacity-60"
        >
          {saveSystem.isPending ? "جارٍ الحفظ…" : "حفظ إعدادات النظام"}
        </button>
      </Section>

      {/* ----------------------------- AI Provider ---------------------------- */}
      <Section
        title="AI Provider"
        hint="المفتاح السري يُخزّن في أسرار الخادم فقط — تغيير المزوّد أو الموديل لا يحذفه."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="AI Provider">
            <select
              dir="ltr"
              className={inputCls}
              value={ai.provider}
              onChange={(e) => setAi({ ...ai, provider: e.target.value as typeof ai.provider })}
            >
              <option value="lovable">Lovable AI Gateway (حالي)</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="custom">Custom API</option>
            </select>
          </Field>
          <Field label="AI Model">
            <input
              dir="ltr"
              className={inputCls}
              value={ai.model}
              onChange={(e) => setAi({ ...ai, model: e.target.value })}
            />
          </Field>
          <Field label="AI Base URL (مطلوب لـ Custom API)">
            <input
              dir="ltr"
              placeholder="https://…/v1"
              className={inputCls}
              disabled={ai.provider !== "custom"}
              value={ai.baseUrl}
              onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })}
            />
          </Field>
          <Field label="AI API Key">
            <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
              <StatusPill value={s?.aiKey.configured ? "CONFIGURED" : "NOT_CONFIGURED"} />
              <span className="text-[11px] text-muted-foreground" dir="ltr">
                {s?.aiKey.envVar}
              </span>
            </div>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={ai.enabled}
              onChange={(e) => setAi({ ...ai, enabled: e.target.checked })}
            />
            AI Enabled
          </label>
          <button
            onClick={() => saveAi.mutate()}
            disabled={saveAi.isPending || !ai.model.trim()}
            className="rounded-lg bg-foreground px-3 py-2 text-[12px] font-bold text-background disabled:opacity-60"
          >
            {saveAi.isPending ? "جارٍ الحفظ…" : "حفظ"}
          </button>
          <button
            onClick={() => testAi.mutate()}
            disabled={testAi.isPending}
            className="rounded-lg border border-border px-3 py-2 text-[12px] font-bold disabled:opacity-60"
          >
            {testAi.isPending ? "جارٍ الاختبار…" : "Test AI Connection"}
          </button>
          {aiTest && <StatusPill value={aiTest.status} />}
          {aiTest && <span className="text-[12px] text-muted-foreground">{aiTest.message}</span>}
        </div>
      </Section>

      {/* ------------------------------- AI Usage ----------------------------- */}
      <Section title="AI Usage" hint="جميع الحدود تُفرض على الخادم بشكل ذرّي ولا يمكن تجاوزها من المتصفح.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Default Monthly Limit">
            <input
              type="number"
              min={0}
              className={inputCls}
              value={aiLimits.defaultMonthlyLimit}
              onChange={(e) => setAiLimits({ ...aiLimits, defaultMonthlyLimit: e.target.value })}
            />
          </Field>
          <Field label="Default Daily Limit">
            <input
              type="number"
              min={0}
              className={inputCls}
              value={aiLimits.defaultDailyLimit}
              onChange={(e) => setAiLimits({ ...aiLimits, defaultDailyLimit: e.target.value })}
            />
          </Field>
          <Field label="Maximum Request Size (bytes)">
            <input
              type="number"
              min={0}
              className={inputCls}
              value={aiLimits.maxRequestBytes}
              onChange={(e) => setAiLimits({ ...aiLimits, maxRequestBytes: e.target.value })}
            />
          </Field>
          <Field label="Request Timeout (ms)">
            <input
              type="number"
              min={5000}
              className={inputCls}
              value={aiLimits.requestTimeoutMs}
              onChange={(e) => setAiLimits({ ...aiLimits, requestTimeoutMs: e.target.value })}
            />
          </Field>
        </div>
        <button
          onClick={() => saveLimits.mutate()}
          disabled={saveLimits.isPending}
          className="mt-3 rounded-lg bg-foreground px-3 py-2 text-[12px] font-bold text-background disabled:opacity-60"
        >
          {saveLimits.isPending ? "جارٍ الحفظ…" : "حفظ الحدود"}
        </button>
      </Section>

      {/* -------------------------- AI Usage Statistics ----------------------- */}
      <Section title="AI Usage Statistics" hint="بيانات حقيقية من قاعدة البيانات.">
        {stats.isLoading && <p className="text-[12px] text-muted-foreground">جارٍ التحميل…</p>}
        {!stats.isLoading && !stats.data && (
          <p className="text-[12px] text-muted-foreground">No Data</p>
        )}
        {stats.data && (
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ["Total Requests", num(stats.data.totalRequests)],
              ["Successful", num(stats.data.successful)],
              ["Failed", num(stats.data.failed)],
              ["Today", num(stats.data.today)],
              ["This Month", num(stats.data.thisMonth)],
              ["Input Tokens", num(stats.data.inputTokens)],
              ["Output Tokens", num(stats.data.outputTokens)],
              ["Total Tokens", num(stats.data.totalTokens)],
              ["Estimated Cost", `$${stats.data.estimatedCost.toFixed(4)}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border p-3">
                <div className="text-[11px] text-muted-foreground">{label}</div>
                <div className="text-sm font-black">{value}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ---------------------- Subscription plans (existing) ------------------ */}
      <Section
        title="خطط الاشتراك وحدودها"
        hint="الحدود تُقرأ من قاعدة البيانات ويُفرضها الخادم — الزائر بدون حساب: فاتورتان."
        action={
          <button
            onClick={() => expire.mutate()}
            disabled={expire.isPending}
            className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold disabled:opacity-60"
          >
            فحص الاشتراكات المنتهية
          </button>
        }
      >
        {plans.isLoading && <p className="text-[12px] text-muted-foreground">جارٍ التحميل…</p>}

        <div className="space-y-3">
          {(plans.data ?? []).map((p) => {
            const d = drafts[p.code];
            if (!d) return null;
            return (
              <div key={p.code} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-black uppercase">{p.name}</div>
                  <span className="text-[11px] text-muted-foreground">
                    {p.currency} / {p.interval}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <Field label="السعر (سنت)">
                    <input
                      type="number"
                      min={0}
                      value={d.priceCents}
                      onChange={(e) =>
                        setDrafts({ ...drafts, [p.code]: { ...d, priceCents: e.target.value } })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="حد الفواتير/شهر">
                    <input
                      type="number"
                      min={0}
                      value={d.invoiceLimit}
                      onChange={(e) =>
                        setDrafts({ ...drafts, [p.code]: { ...d, invoiceLimit: e.target.value } })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="حد المعالجة">
                    <input
                      type="number"
                      min={0}
                      value={d.processingLimit}
                      onChange={(e) =>
                        setDrafts({
                          ...drafts,
                          [p.code]: { ...d, processingLimit: e.target.value },
                        })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <div className="flex items-end">
                    <button
                      onClick={() => save.mutate(p.code)}
                      disabled={save.isPending}
                      className="w-full rounded-lg bg-foreground px-3 py-2 text-[12px] font-bold text-background disabled:opacity-60"
                    >
                      حفظ
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ------------------------------ System Logs --------------------------- */}
      <Section title="System Logs" hint="أحداث النظام المهمة — بدون أي أسرار أو مفاتيح.">
        {logs.isLoading && <p className="text-[12px] text-muted-foreground">جارٍ التحميل…</p>}
        {!logs.isLoading && (logs.data?.length ?? 0) === 0 && (
          <p className="text-[12px] text-muted-foreground">No Data</p>
        )}
        {(logs.data?.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-right text-[12px]">
              <thead className="bg-muted/60 text-[11px] text-muted-foreground">
                <tr>
                  <th className="p-2">الحدث</th>
                  <th className="p-2">المستوى</th>
                  <th className="p-2">التفصيل</th>
                  <th className="p-2">المستخدم</th>
                  <th className="p-2">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {logs.data!.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2 font-bold">{r.event}</td>
                    <td className="p-2">{r.level}</td>
                    <td className="p-2">{r.detail ?? "—"}</td>
                    <td className="p-2" dir="ltr">
                      {r.actorEmail ?? "—"}
                    </td>
                    <td className="p-2">{fmt(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* --------------------------- Admin audit log -------------------------- */}
      <Section title="سجل تدقيق الإجراءات الإدارية">
        {isLoading && <p className="text-[12px] text-muted-foreground">جارٍ التحميل…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="text-[12px] text-muted-foreground">لا توجد إجراءات مسجّلة</p>
        )}
        {(data?.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-right text-[12px]">
              <thead className="bg-muted/60 text-[11px] text-muted-foreground">
                <tr>
                  <th className="p-2">الإجراء</th>
                  <th className="p-2">المدير</th>
                  <th className="p-2">المستخدم المستهدف</th>
                  <th className="p-2">الخطة</th>
                  <th className="p-2">الحالة</th>
                  <th className="p-2">المدة</th>
                  <th className="p-2">السبب</th>
                  <th className="p-2">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {data!.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2 font-bold">{r.action}</td>
                    <td className="p-2" dir="ltr">
                      {r.adminEmail ?? "—"}
                    </td>
                    <td className="p-2" dir="ltr">
                      {r.targetEmail ?? r.targetUserId ?? "—"}
                    </td>
                    <td className="p-2">
                      {r.oldPlan || r.newPlan ? `${r.oldPlan ?? "—"} → ${r.newPlan ?? "—"}` : "—"}
                    </td>
                    <td className="p-2">
                      {r.oldStatus || r.newStatus
                        ? `${r.oldStatus ?? "—"} → ${r.newStatus ?? "—"}`
                        : "—"}
                    </td>
                    <td className="p-2">{r.durationDays ? `${r.durationDays} يوم` : "—"}</td>
                    <td className="p-2">{r.reason ?? "—"}</td>
                    <td className="p-2">{fmt(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  adminListPaymentProviders,
  adminSavePaymentProvider,
  adminSetPaymentProviderEnabled,
  adminTestPaymentProvider,
  type ProviderView,
} from "@/lib/payments.functions";
import { Check, Copy, Plug, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin/payments")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "بوابات الدفع — لوحة إدارة دفتر" },
      {
        name: "description",
        content: "ربط وإدارة بوابات الدفع PayTR و Paddle و Zain Cash بأمان من لوحة الإدارة.",
      },
      { property: "og:title", content: "بوابات الدفع — لوحة إدارة دفتر" },
      { property: "og:description", content: "إعداد بيانات بوابات الدفع، البيئة، والتفعيل." },
    ],
  }),
  component: PaymentProvidersPage,
});

const STATUS_LABEL: Record<ProviderView["status"], { text: string; cls: string }> = {
  not_configured: { text: "Not Configured", cls: "bg-muted text-muted-foreground" },
  configured: { text: "Configured", cls: "bg-amber-100 text-amber-800" },
  enabled: { text: "Connected", cls: "bg-emerald-100 text-emerald-800" },
  disabled: { text: "Disabled", cls: "bg-muted text-muted-foreground" },
  error: { text: "Error", cls: "bg-destructive/10 text-destructive" },
};

function PaymentProvidersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPaymentProviders);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-payment-providers"],
    queryFn: () => listFn(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-payment-providers"] });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black">Payment Providers</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          أدخل بيانات حساباتك الحقيقية هنا — تُخزَّن مشفّرة على الخادم ولا تُعرض مرة أخرى.
        </p>
      </div>

      {isLoading && <p className="text-[12px] text-muted-foreground">جارٍ التحميل…</p>}

      <div className="grid gap-4">
        {(data ?? []).map((p) => (
          <ProviderCard key={p.id} p={p} onChanged={() => void refresh()} />
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-border p-4 text-[12px] text-muted-foreground">
        <span className="font-bold text-foreground">+ Add Provider</span> — إضافة بوابة جديدة تتطلّب
        أولًا إنشاء Adapter/تكامل لها في الخادم، وبعدها تظهر هنا لإدخال بياناتها وتفعيلها دون أي
        تعديل إضافي على الكود.
      </div>
    </div>
  );
}

function ProviderCard({ p, onChanged }: { p: ProviderView; onChanged: () => void }) {
  const saveFn = useServerFn(adminSavePaymentProvider);
  const toggleFn = useServerFn(adminSetPaymentProviderEnabled);
  const testFn = useServerFn(adminTestPaymentProvider);

  const [open, setOpen] = useState(false);
  const [env, setEnv] = useState(p.environment);
  const ev = p.environmentViews.find((e) => e.value === env) ?? p.environmentViews[0]!;
  const cur = p.environmentViews.find((e) => e.value === p.environment) ?? ev;
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const s = STATUS_LABEL[p.status];

  const save = useMutation({
    mutationFn: () => {
      const config: Record<string, string> = {};
      const secrets: Record<string, string> = {};
      for (const f of p.fields) {
        const v = values[f.key];
        if (v === undefined || v.trim() === "") continue;
        if (f.secret) secrets[f.key] = v;
        else config[f.key] = v;
      }
      return saveFn({ data: { provider: p.id, environment: env, config, secrets } });
    },
    onSuccess: () => {
      toast.success("تم حفظ الإعدادات بأمان");
      setValues({});
      setOpen(false);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => toggleFn({ data: { provider: p.id, enabled } }),
    onSuccess: (r) => {
      toast.success(r.enabled ? "تم تفعيل البوابة" : "تم تعطيل البوابة");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { provider: p.id, environment: env } }),
    onSuccess: (r) => {
      if (!r.supported) toast.info(r.message);
      else if (r.ok) toast.success("Connection successful ✓");
      else toast.error(`Connection failed — ${r.message}`);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async () => {
    await navigator.clipboard.writeText(p.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Plug className="size-4" />
          <span className="text-sm font-black">{p.displayName}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.cls}`}>{s.text}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">
            {p.environments.find((e) => e.value === p.environment)?.label ?? p.environment}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold"
          >
            Configure
          </button>
          <button
            onClick={() => test.mutate()}
            disabled={test.isPending || !ev.complete || !p.supportsConnectionTest}
            className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold disabled:opacity-50"
          >
            Test Connection
          </button>
          {p.enabled ? (
            <button
              onClick={() => toggle.mutate(false)}
              disabled={toggle.isPending}
              className="rounded-lg border border-destructive/40 px-3 py-1.5 text-[12px] font-bold text-destructive disabled:opacity-50"
            >
              Disable
            </button>
          ) : (
            <button
              onClick={() => toggle.mutate(true)}
              disabled={toggle.isPending || !cur.canEnable}
              title={cur.canEnable ? "" : (cur.enableBlockedReason ?? "")}
              className="rounded-lg bg-foreground px-3 py-1.5 text-[12px] font-bold text-background disabled:opacity-50"
            >
              Enable
            </button>
          )}
        </div>
      </div>

      {p.notes && <p className="mt-2 text-[11px] text-muted-foreground">{p.notes}</p>}
      {p.lastError && (
        <p className="mt-2 text-[11px] text-destructive">آخر خطأ: {p.lastError}</p>
      )}
      {!p.supportsConnectionTest && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          هذا المزوّد لا يوفّر نقطة رسمية لاختبار بيانات الاعتماد.
        </p>
      )}

      {/* ملخص الحالة */}
      <div className="mt-3 grid gap-1 rounded-lg border border-border p-2 text-[11px] sm:grid-cols-3">
        <div>
          <span className="text-muted-foreground">Environment: </span>
          <span className="font-bold">{ev.label}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Configured: </span>
          <span className={`font-bold ${ev.complete ? "text-emerald-700" : "text-muted-foreground"}`}>
            {ev.complete ? "✓" : "✗"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Connection Test: </span>
          <span
            className={`font-bold ${
              ev.testStatus === "passed"
                ? "text-emerald-700"
                : ev.testStatus === "failed"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            {ev.testStatus === "passed"
              ? "✓ Passed"
              : ev.testStatus === "failed"
                ? "✗ Failed"
                : ev.testStatus === "unsupported"
                  ? "Not supported"
                  : "Not tested"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Last Tested: </span>
          <span className="font-bold" dir="ltr">
            {ev.lastTestedAt ? new Date(ev.lastTestedAt).toLocaleString("en-GB") : "—"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Enabled: </span>
          <span className="font-bold">{p.enabled ? "✓" : "✗"}</span>
        </div>
        {!ev.canEnable && (
          <div className="text-muted-foreground sm:col-span-3">{ev.enableBlockedReason}</div>
        )}
      </div>

      {/* حالة الحقول للبيئة المختارة */}
      <div className="mt-3 grid gap-1 sm:grid-cols-2">
        {ev.fields.map((f) => (
          <div key={f.key} className="flex items-center justify-between rounded-lg bg-muted/50 px-2 py-1.5">
            <span className="text-[11px] font-semibold">{f.label}</span>
            <span
              className={`text-[11px] ${f.configured ? "text-emerald-700" : "text-muted-foreground"}`}
            >
              {f.secret
                ? f.configured
                  ? "•••••••••••• Configured ✓"
                  : "Missing"
                : f.configured
                  ? (f.value ?? "Configured ✓")
                  : "Missing"}
            </span>
          </div>
        ))}
      </div>

      {/* Webhook / Callback */}
      <div className="mt-3 rounded-lg border border-border p-2">
        <div className="text-[11px] font-bold">
          {p.callbackKind === "webhook" ? "Webhook URL" : "Callback URL"}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-[11px]" dir="ltr">
            {p.webhookUrl}
          </code>
          <button
            onClick={() => void copy()}
            className="rounded-lg border border-border px-2 py-1 text-[11px] font-bold"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </div>
        {!p.recurring && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            لا يدعم التجديد التلقائي — تُفعَّل دورة اشتراك واحدة عند كل عملية دفع مؤكدة.
          </p>
        )}
      </div>

      {/* Configure form */}
      {open && (
        <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            القيم السرّية تُشفَّر على الخادم ولا تُعاد إلى المتصفح أبدًا. اترك الحقل فارغًا للإبقاء
            على القيمة الحالية.
          </div>

          <label className="block text-[11px]">
            <span className="text-muted-foreground">Environment</span>
            <select
              value={env}
              onChange={(e) => {
                setEnv(e.target.value);
                setValues({});
              }}
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              {p.environments.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>

          {ev.fields.map((f) => (
            <label key={f.key} className="block text-[11px]">
              <span className="text-muted-foreground">
                {f.label}
                {f.required ? " *" : ""}
                {f.secret && f.configured ? " — Configured ✓ (Update Secret)" : ""}
              </span>
              <input
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                placeholder={f.placeholder ?? (f.secret && f.configured ? "••••••••" : "")}
                value={values[f.key] ?? (f.secret ? "" : (f.value ?? ""))}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                dir="ltr"
              />
              {f.hint && <span className="text-[10px] text-muted-foreground">{f.hint}</span>}
            </label>
          ))}

          <div className="flex gap-2">
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="rounded-lg bg-foreground px-4 py-2 text-[12px] font-bold text-background disabled:opacity-60"
            >
              Save
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setValues({});
              }}
              className="rounded-lg border border-border px-4 py-2 text-[12px] font-bold"
            >
              إلغاء
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            الحفظ يعطّل البوابة مؤقتًا عند تغيير البيئة — فعّلها بعد التأكد. تغيير البيانات لا يمسّ
            المستخدمين أو الاشتراكات أو الفواتير الحالية.
          </p>
        </div>
      )}
    </div>
  );
}

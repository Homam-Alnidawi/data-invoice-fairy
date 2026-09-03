import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, Plug, ShieldCheck } from "lucide-react";
import {
  adminListPaymentProviders,
  adminSavePaymentProvider,
  adminSetPaymentProviderEnabled,
  adminTestPaymentProvider,
  type ProviderView,
} from "@/lib/payments.functions";

export const Route = createFileRoute("/admin/payments")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "بوابات الدفع — لوحة إدارة دفتر" },
      { name: "description", content: "إدارة بوابات الدفع API وطرق الدفع اليدوي بأمان من لوحة الإدارة." },
      { property: "og:title", content: "بوابات الدفع — لوحة إدارة دفتر" },
      { property: "og:description", content: "إعداد وتفعيل PayTR وPaddle وZain Cash وطرق الدفع اليدوي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
const isManual = (id: string) => id.endsWith("_manual");

function PaymentProvidersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPaymentProviders);
  const { data, isLoading } = useQuery({ queryKey: ["admin-payment-providers"], queryFn: () => listFn() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-payment-providers"] });
  return <div className="space-y-6"><div><h1 className="text-xl font-black">Payment Providers</h1><p className="mt-1 text-[12px] text-muted-foreground">البوابات API الحالية منفصلة عن طرق الدفع اليدوي. لا يتم تفعيل أي طريقة إلا بعد اكتمال إعدادها.</p></div>{isLoading && <p className="text-[12px] text-muted-foreground">جارٍ التحميل…</p>}<div className="grid gap-4">{(data ?? []).map((provider) => <ProviderCard key={provider.id} p={provider} onChanged={() => void refresh()} />)}</div></div>;
}

function ProviderCard({ p, onChanged }: { p: ProviderView; onChanged: () => void }) {
  const saveFn = useServerFn(adminSavePaymentProvider);
  const toggleFn = useServerFn(adminSetPaymentProviderEnabled);
  const testFn = useServerFn(adminTestPaymentProvider);
  const [open, setOpen] = useState(false);
  const [env, setEnv] = useState(p.environment);
  const ev = p.environmentViews.find((item) => item.value === env) ?? p.environmentViews[0];
  const cur = p.environmentViews.find((item) => item.value === p.environment) ?? ev;
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const manual = isManual(p.id);
  const s = STATUS_LABEL[p.status];

  const save = useMutation({
    mutationFn: () => {
      const config: Record<string, string> = {};
      const secrets: Record<string, string> = {};
      for (const field of p.fields) { const value = values[field.key]; if (!value?.trim()) continue; if (field.secret) secrets[field.key] = value; else config[field.key] = value; }
      return saveFn({ data: { provider: p.id, environment: env, config, secrets } });
    },
    onSuccess: () => { toast.success("تم حفظ الإعدادات بأمان"); setValues({}); setOpen(false); onChanged(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => toggleFn({ data: { provider: p.id, enabled } }),
    onSuccess: (result) => { toast.success(result.enabled ? "تم تفعيل الطريقة" : "تم تعطيل الطريقة"); onChanged(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const test = useMutation({
    mutationFn: () => testFn({ data: { provider: p.id, environment: env } }),
    onSuccess: (result) => { if (!result.supported) toast.info(result.message); else if (result.ok) toast.success("Connection successful ✓"); else toast.error(`Connection failed — ${result.message}`); onChanged(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const copy = async () => { if (!p.webhookUrl) return; await navigator.clipboard.writeText(p.webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return <div className="rounded-xl border border-border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Plug className="size-4" /><span className="text-sm font-black">{p.displayName}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.cls}`}>{s.text}</span>{manual && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">Manual review</span>}</div><div className="flex flex-wrap items-center gap-2"><button onClick={() => setOpen((value) => !value)} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold">Configure</button>{!manual && <button onClick={() => test.mutate()} disabled={test.isPending || !ev?.complete || !p.supportsConnectionTest} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold disabled:opacity-50">Test Connection</button>}{p.enabled ? <button onClick={() => toggle.mutate(false)} disabled={toggle.isPending} className="rounded-lg border border-destructive/40 px-3 py-1.5 text-[12px] font-bold text-destructive disabled:opacity-50">Disable</button> : <button onClick={() => toggle.mutate(true)} disabled={toggle.isPending || !cur?.canEnable} title={cur?.canEnable ? "" : (cur?.enableBlockedReason ?? "")} className="rounded-lg bg-foreground px-3 py-1.5 text-[12px] font-bold text-background disabled:opacity-50">Enable</button>}</div></div>{p.notes && <p className="mt-2 text-[11px] text-muted-foreground">{p.notes}</p>}{manual && <p className="mt-2 rounded-lg bg-muted/60 p-2 text-[11px] text-muted-foreground">الدفع اليدوي لا يستخدم API أو Callback أو Auto-Renewal. يظهر للمستخدم فقط بعد تفعيل هذه الطريقة.</p>}
    <div className="mt-3 grid gap-1 rounded-lg border border-border p-2 text-[11px] sm:grid-cols-3"><div><span className="text-muted-foreground">Configured: </span><span className="font-bold">{ev?.complete ? "✓" : "✗"}</span></div><div><span className="text-muted-foreground">Enabled: </span><span className="font-bold">{p.enabled ? "✓" : "✗"}</span></div><div><span className="text-muted-foreground">Renewal: </span><span className="font-bold">{p.recurring ? "Automatic" : "One cycle"}</span></div>{!cur?.canEnable && <div className="text-muted-foreground sm:col-span-3">{cur?.enableBlockedReason}</div>}</div>
    <div className="mt-3 grid gap-1 sm:grid-cols-2">{ev?.fields.map((field) => <div key={field.key} className="flex items-center justify-between rounded-lg bg-muted/50 px-2 py-1.5"><span className="text-[11px] font-semibold">{field.label}</span><span className={`text-[11px] ${field.configured ? "text-emerald-700" : "text-muted-foreground"}`}>{field.secret ? (field.configured ? "•••••• Configured ✓" : "Missing") : (field.value ?? (field.configured ? "Configured ✓" : "Missing"))}</span></div>)}</div>
    {!manual && <div className="mt-3 rounded-lg border border-border p-2"><div className="text-[11px] font-bold">{p.callbackKind === "webhook" ? "Webhook URL" : "Callback URL"}</div><div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-[11px]" dir="ltr">{p.webhookUrl}</code><button onClick={() => void copy()} className="rounded-lg border border-border px-2 py-1 text-[11px] font-bold">{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button></div></div>}
    {open && <div className="mt-3 space-y-3 rounded-lg border border-border p-3"><div className="flex items-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck className="size-3.5" /> القيم السرّية تُشفّر على الخادم ولا تعود إلى المتصفح.</div>{!manual && <label className="block text-[11px]"><span className="text-muted-foreground">Environment</span><select value={env} onChange={(event) => { setEnv(event.target.value); setValues({}); }} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">{p.environments.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}{ev?.fields.map((field) => <label key={field.key} className="block text-[11px]"><span className="text-muted-foreground">{field.label}{field.required ? " *" : ""}{field.secret && field.configured ? " — Configured ✓ (Update Secret)" : ""}</span><input type={field.secret ? "password" : "text"} autoComplete="off" placeholder={field.placeholder ?? (field.secret && field.configured ? "••••••••" : "")} value={values[field.key] ?? (field.secret ? "" : (field.value ?? ""))} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" dir="ltr" />{field.hint && <span className="text-[10px] text-muted-foreground">{field.hint}</span>}</label>)}<div className="flex gap-2"><button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-lg bg-foreground px-4 py-2 text-[12px] font-bold text-background disabled:opacity-60">Save</button><button onClick={() => { setOpen(false); setValues({}); }} className="rounded-lg border border-border px-4 py-2 text-[12px] font-bold">إلغاء</button></div></div>}
  </div>;
}

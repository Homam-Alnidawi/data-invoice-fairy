import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, CreditCard, FileImage, Loader2, Mail, Smartphone, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { listPublicPlans, type Plan } from "@/lib/subscriptions.functions";
import { listAvailablePaymentProviders, type PublicProvider } from "@/lib/payments.functions";
import { createCheckoutSession } from "@/lib/checkout.functions";
import { createManualPaymentRequest } from "@/lib/payment-requests.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/checkout")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Checkout — دفتر" },
      { name: "description", content: "اختر طريقة الدفع وأكمل اشتراكك في دفتر." },
      { property: "og:title", content: "Checkout — دفتر" },
      { property: "og:description", content: "دفع آمن عبر البوابات المتاحة أو إرسال إثبات دفع يدوي للمراجعة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutPage,
});

const manualProviders = new Set(["paypal_manual", "zaincash_manual", "card_manual"]);

function providerIcon(id: string) {
  if (id === "paypal_manual") return <Wallet className="size-5" />;
  if (id === "zaincash_manual") return <Smartphone className="size-5" />;
  if (id === "card_manual") return <CreditCard className="size-5" />;
  return <CreditCard className="size-5" />;
}

function money(plan: Plan | undefined) {
  if (!plan) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: plan.currency || "USD" }).format(plan.priceCents / 100);
}

function CheckoutPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const plansFn = useServerFn(listPublicPlans);
  const providersFn = useServerFn(listAvailablePaymentProviders);
  const apiCheckoutFn = useServerFn(createCheckoutSession);
  const manualRequestFn = useServerFn(createManualPaymentRequest);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [planCode, setPlanCode] = useState("pro");
  const [providerId, setProviderId] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const requestedPlan = new URLSearchParams(window.location.search).get("plan");
    if (requestedPlan) setPlanCode(requestedPlan);
    void Promise.all([plansFn(), providersFn()])
      .then(([nextPlans, nextProviders]) => {
        setPlans(nextPlans);
        setProviders(nextProviders);
        setProviderId(nextProviders[0]?.id ?? null);
      })
      .catch(() => toast.error("تعذّر تحميل خيارات الدفع."));
  }, [plansFn, providersFn]);

  const plan = useMemo(() => plans.find((item) => item.code === planCode) ?? plans.find((item) => item.code === "pro"), [plans, planCode]);
  const selected = providers.find((item) => item.id === providerId) ?? null;
  const isManual = selected ? manualProviders.has(selected.id) : false;

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success("تم النسخ");
  };

  const submit = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      void navigate({ to: "/login" });
      return;
    }
    if (!selected || !plan) {
      toast.error("اختر الخطة وطريقة الدفع أولًا.");
      return;
    }

    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      if (isManual) {
        if (!transactionId.trim() && !proofFile) {
          throw new Error("أدخل رقم العملية أو ارفع إثبات الدفع.");
        }
        if (proofFile) {
          if (proofFile.size > 10 * 1024 * 1024) throw new Error("حجم إثبات الدفع يجب ألا يتجاوز 10MB.");
          const safeName = proofFile.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
          uploadedPath = `${data.user.id}/${crypto.randomUUID()}-${safeName}`;
          const { error } = await supabase.storage.from("payment-proofs").upload(uploadedPath, proofFile, {
            contentType: proofFile.type || "application/octet-stream",
            upsert: false,
          });
          if (error) throw new Error("تعذّر رفع إثبات الدفع.");
        }
        await manualRequestFn({
          data: {
            provider: selected.id as "paypal_manual" | "zaincash_manual" | "card_manual",
            plan: plan.code,
            transactionId: transactionId.trim() || undefined,
            paymentProof: uploadedPath ?? undefined,
          },
        });
        setSubmitted(true);
        toast.success("تم إرسال طلب الدفع للمراجعة.");
      } else {
        const result = await apiCheckoutFn({ data: { provider: selected.id, plan: plan.code } });
        window.location.href = result.url;
      }
    } catch (error) {
      if (uploadedPath) await supabase.storage.from("payment-proofs").remove([uploadedPath]).catch(() => undefined);
      toast.error((error as Error).message || "تعذّر إتمام الدفع.");
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background px-4 py-10 text-foreground">
        <main className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-700"><Check className="size-7" /></div>
          <h1 className="mt-4 text-2xl font-black">طلب الدفع قيد المراجعة</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">سيتحقق المدير من إثبات الدفع. عند الاعتماد ستُفعّل دورة اشتراك واحدة، بدون تجديد تلقائي.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button asChild><Link to="/dashboard">العودة إلى لوحة التحميل</Link></Button>
            <Button asChild variant="outline"><Link to="/settings">متابعة الاشتراك</Link></Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground sm:py-10">
      <main className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <Link to="/pricing" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> العودة للأسعار</Link>
          <Link to="/" className="text-sm font-black">{t("brand.name")}</Link>
        </div>
        <h1 className="mt-8 text-3xl font-black tracking-tight">إتمام الاشتراك</h1>
        <p className="mt-2 text-sm text-muted-foreground">اختر الطريقة المناسبة. البوابات API تفتح صفحة الدفع، والدفع اليدوي ينتظر مراجعة المدير.</p>

        <div className="mt-6 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs font-bold text-muted-foreground">الخطة</div>
            <select value={planCode} onChange={(event) => setPlanCode(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold">
              {plans.filter((item) => item.code !== "free").map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            <div className="mt-5 border-t border-border pt-4">
              <div className="text-xs text-muted-foreground">المبلغ المستحق</div>
              <div className="mt-1 text-3xl font-black" dir="ltr">{money(plan)}</div>
              <div className="mt-1 text-xs text-muted-foreground">دورة واحدة — لا يوجد تجديد تلقائي للدفع اليدوي</div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-black">طرق الدفع المتاحة</h2><span className="text-[11px] text-muted-foreground">الحالة من الخادم</span></div>
            {providers.length === 0 ? <p className="mt-5 rounded-lg bg-muted p-3 text-sm text-muted-foreground">لا توجد طريقة دفع مفعّلة حاليًا.</p> : <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {providers.map((item) => <button key={item.id} type="button" onClick={() => setProviderId(item.id)} className={`flex items-center gap-3 rounded-xl border p-3 text-right transition ${providerId === item.id ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"}`}>
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">{providerIcon(item.id)}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-black">{item.displayName}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{item.recurring ? "تجديد تلقائي" : "دورة واحدة"}</span></span>
              </button>)}
            </div>}

            {selected && isManual && <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex items-center gap-2 text-sm font-black">{providerIcon(selected.id)} تفاصيل التحويل</div>
              {selected.publicConfig["account"] && <div className="mt-3 flex items-center gap-2 rounded-lg bg-background p-3"><Mail className="size-4 text-muted-foreground" /><code className="min-w-0 flex-1 break-all text-sm" dir="ltr">{selected.publicConfig["account"]}</code><Button type="button" size="icon" variant="ghost" aria-label="نسخ بيانات الحساب" onClick={() => void copy(selected.publicConfig["account"])}><Copy /></Button></div>}
              {selected.publicConfig["instructions"] && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{selected.publicConfig["instructions"]}</p>}
              <label className="mt-4 block text-xs font-bold">رقم العملية / المرجع (اختياري إذا رفعت الإثبات)<input value={transactionId} onChange={(event) => setTransactionId(event.target.value)} maxLength={160} dir="ltr" className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal" /></label>
              <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-3 text-sm font-bold"><FileImage className="size-4" /> <span className="min-w-0 flex-1 truncate">{proofFile?.name ?? "رفع صورة أو PDF لإثبات الدفع"}</span><input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(event) => setProofFile(event.target.files?.[0] ?? null)} /></label>
              <p className="mt-2 text-[11px] text-muted-foreground">الحد الأقصى 10MB. لا يتم تفعيل الاشتراك إلا بعد مراجعة المدير.</p>
            </div>}

            <Button type="button" className="mt-5 w-full" disabled={busy || !selected || !plan} onClick={() => void submit()}>{busy && <Loader2 className="animate-spin" />}{busy ? "جارٍ تجهيز الطلب…" : isManual ? "إرسال طلب الدفع للمراجعة" : "المتابعة إلى الدفع"}</Button>
          </section>
        </div>
      </main>
    </div>
  );
}

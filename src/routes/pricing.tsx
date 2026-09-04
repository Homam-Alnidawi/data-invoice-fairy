import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { getUsageState, type UsageState } from "@/lib/usage.functions";
import { listPublicPlans, type Plan } from "@/lib/subscriptions.functions";

export const Route = createFileRoute("/pricing")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الاشتراكات والأسعار — دفتر" },
      { name: "description", content: "اختر باقة دفتر المناسبة لفواتيرك وادفع عبر الطريقة المتاحة لك." },
      { property: "og:title", content: "الاشتراكات والأسعار — دفتر" },
      { property: "og:description", content: "باقات دفتر لمعالجة الفواتير وحفظها وتصدير التقارير." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const usageFn = useServerFn(getUsageState);
  const plansFn = useServerFn(listPublicPlans);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    void usageFn({}).then(setUsage).catch(() => undefined);
    void plansFn().then(setPlans).catch(() => undefined);
  }, [usageFn, plansFn]);

  const isPro = usage?.kind === "pro";
  const freePlan = plans.find((p) => p.code === "free");
  const proPlan = plans.find((p) => p.code === "pro");
  const businessPlan = plans.find((p) => p.code === "business");
  const money = (p?: Plan) => p ? new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency || "USD" }).format(p.priceCents / 100) : "—";
  const proFeatures = proPlan?.features.length ? proPlan.features : ["pr.feature1", "pr.feature2", "pr.feature3", "pr.feature4", "pr.feature5", "pr.feature6", "pr.feature7"].map((k) => t(k));
  const businessFeatures = businessPlan?.features.length ? businessPlan.features : [t("pr.business.f1", { n: businessPlan?.invoiceLimit ?? 2000 }), t("pr.business.f2"), t("pr.business.f3")];
  const checkout = (plan = "pro") => void navigate({ to: "/checkout", search: { plan } });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2"><BrandMark /><div className="leading-none"><div className="text-[15px] font-extrabold tracking-tight">{t("brand.name")}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{t("pr.sub")}</div></div></Link>
          <Link to="/dashboard" className="rounded-full bg-surface px-3 py-1.5 text-[11px] font-bold ring-1 ring-black/5">{t("pr.back")}</Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-balance">{t("pr.title")}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{t("pr.lead")}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5"><div className="text-[13px] font-extrabold">Free</div><div className="mt-1 text-[20px] font-extrabold">{t("pr.free")}</div><ul className="mt-2 space-y-1 text-[11px] text-muted-foreground"><li>• {t("pr.free.f1", { n: freePlan?.invoiceLimit ?? 5 })}</li><li>• {t("pr.free.f2")}</li><li>• {t("pr.free.f3")}</li></ul></div>
          <div className="rounded-2xl bg-ink p-4 text-ink-foreground ring-1 ring-black/5"><div className="text-[13px] font-extrabold">Pro</div><div className="mt-1 text-[20px] font-extrabold">{money(proPlan)} <span className="text-[12px] font-bold opacity-70">{t("pr.perMonth")}</span></div><ul className="mt-2 space-y-1 text-[11px] opacity-80"><li>• {t("pr.pro.f1", { n: proPlan?.invoiceLimit ?? 1000 })}</li><li>• {t("pr.pro.f2")}</li><li>• {t("pr.pro.f3")}</li></ul></div>
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-brand/40"><div className="text-[13px] font-extrabold">Business</div><div className="mt-1 text-[20px] font-extrabold">{money(businessPlan)} <span className="text-[12px] font-bold text-muted-foreground">{t("pr.perMonth")}</span></div><ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">{businessFeatures.map((feature) => <li key={feature}>• {feature}</li>)}</ul>{!isPro && <button type="button" onClick={() => checkout("business")} disabled={!businessPlan} className="mt-3 w-full rounded-xl bg-brand py-2.5 text-[12px] font-extrabold text-primary-foreground disabled:opacity-50">{t("pr.subscribe", { price: money(businessPlan) })}</button>}</div>
        </div>
        <section className="mt-6 overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5"><div className="bg-ink p-5 text-ink-foreground"><div className="text-[11px] opacity-70">{t("pr.section")}</div><div className="mt-1 text-[32px] font-extrabold leading-none tracking-tight">{money(proPlan)} <span className="text-[15px] font-bold opacity-70">{t("pr.perMonth")}</span></div><div className="mt-1.5 text-[11px] opacity-70">{t("pr.sectionNote", { n: proPlan?.invoiceLimit ?? 1000 })}</div></div><ul className="space-y-2 p-4">{proFeatures.map((feature) => <li key={feature} className="flex items-start gap-2 text-[13px]"><span className="mt-0.5 text-brand">✓</span><span>{feature}</span></li>)}</ul><div className="p-4 pt-0">{isPro ? <div className="rounded-xl bg-brand-soft/50 p-3 text-center text-[13px] font-bold">{t("pr.subscribed")}</div> : <button type="button" onClick={() => checkout("pro")} disabled={!proPlan} className="w-full rounded-xl bg-brand py-3.5 text-[14px] font-extrabold text-primary-foreground disabled:opacity-50">{t("pr.subscribe", { price: money(proPlan) })}</button>}{usage?.kind === "guest" && <p className="mt-2 text-center text-[11px] text-muted-foreground">{t("pr.noAccount")} <Link to="/signup" className="font-bold text-brand">{t("pr.freeSignupLink")}</Link> {t("pr.freeSignupNote", { n: freePlan?.invoiceLimit ?? 5 })}</p>}</div></section>
      </main>
    </div>
  );
}

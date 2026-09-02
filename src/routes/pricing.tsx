import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getUsageState, type UsageState } from "@/lib/usage.functions";
import { listPublicPlans, type Plan } from "@/lib/subscriptions.functions";
import {
  listAvailablePaymentProviders,
  type PublicProvider,
} from "@/lib/payments.functions";
import { createCheckoutSession } from "@/lib/checkout.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/pricing")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "خطة Pro — دفتر لفواتير المشتريات" },
      {
        name: "description",
        content:
          "خطة Pro من دفتر: 1000 فاتورة شهريًا، حفظ الفواتير في حسابك، أرشيف شهري، مراجعة يدوية، وتصدير Excel و CSV و PDF مقابل 25$ شهريًا.",
      },
      { property: "og:title", content: "خطة Pro — دفتر لفواتير المشتريات" },
      {
        property: "og:description",
        content: "1000 فاتورة شهريًا مع حفظ وأرشفة الفواتير وتصديرها — 25$ شهريًا.",
      },
    ],
  }),
  component: Pricing,
});



function Pricing() {
  const { t } = useI18n();
  const usageFn = useServerFn(getUsageState);
  const plansFn = useServerFn(listPublicPlans);
  const providersFn = useServerFn(listAvailablePaymentProviders);
  const checkoutFn = useServerFn(createCheckoutSession);
  const [starting, setStarting] = useState(false);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    void usageFn({})
      .then(setUsage)
      .catch(() => undefined);
    void plansFn()
      .then(setPlans)
      .catch(() => undefined);
    void providersFn()
      .then((list) => {
        setProviders(list);
        setProvider(list[0]?.id ?? null);
      })
      .catch(() => undefined);
  }, [usageFn, plansFn, providersFn]);

  const isPro = usage?.kind === "pro";
  const freePlan = plans.find((p) => p.code === "free");
  const proPlan = plans.find((p) => p.code === "pro");
  const money = (p?: Plan) =>
    p ? `$${(p.priceCents / 100).toLocaleString("en-US")}` : "—";
  const proFeatures = proPlan?.features.length
    ? proPlan.features
    : ["pr.feature1","pr.feature2","pr.feature3","pr.feature4","pr.feature5","pr.feature6","pr.feature7"].map((k) => t(k));

  const subscribe = async () => {
    const chosen = providers.find((p) => p.id === provider);
    if (!chosen) {
      toast.error(t("pr.toastChoose"));
      return;
    }
    if (usage?.kind === "guest") {
      toast.error(t("pr.toastLogin"));
      return;
    }
    setStarting(true);
    try {
      const res = await checkoutFn({ data: { provider: chosen.id, plan: "pro" } });
      toast.success(t("pr.toastRedirect",{name:chosen.displayName}));
      window.location.href = res.url;
    } catch (e) {
      setStarting(false);
      toast.error((e as Error).message || t("pr.toastFail"));
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-brand text-base leading-none font-extrabold text-primary-foreground">
              {t("brand.mark")}
            </div>
            <div className="leading-none">
              <div className="text-[15px] font-extrabold tracking-tight">{t("brand.name")}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{t("pr.sub")}</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard"
              className="rounded-full bg-surface px-3 py-1.5 text-[11px] font-bold ring-1 ring-black/5"
            >
              {t("pr.back")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-8 pb-16">
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight text-balance">
          {t("pr.title")}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {t("pr.lead")}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
            <div className="text-[13px] font-extrabold">Free</div>
            <div className="mt-1 text-[20px] font-extrabold">{t("pr.free")}</div>
            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <li>• {t("pr.free.f1",{n:freePlan?.invoiceLimit ?? 5})}</li>
              <li>• {t("pr.free.f2")}</li>
              <li>• {t("pr.free.f3")}</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-ink p-4 text-ink-foreground ring-1 ring-black/5">
            <div className="text-[13px] font-extrabold">Pro</div>
            <div className="mt-1 text-[20px] font-extrabold">
              {money(proPlan)} <span className="text-[12px] font-bold opacity-70">{t("pr.perMonth")}</span>
            </div>
            <ul className="mt-2 space-y-1 text-[11px] opacity-80">
              <li>• {t("pr.pro.f1",{n:proPlan?.invoiceLimit ?? 1000})}</li>
              <li>• {t("pr.pro.f2")}</li>
              <li>• {t("pr.pro.f3")}</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-brand/40">
            <div className="text-[13px] font-extrabold">Business</div>
            <div className="mt-1 text-[20px] font-extrabold">
              {money(businessPlan)}{" "}
              <span className="text-[12px] font-bold text-muted-foreground">
                {t("pr.perMonth")}
              </span>
            </div>
            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              {businessFeatures.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
            {!isPro && (
              <button
                type="button"
                onClick={() => void subscribe("business")}
                disabled={providers.length === 0 || starting || !businessPlan}
                className="mt-3 w-full rounded-xl bg-brand py-2.5 text-[12px] font-extrabold text-primary-foreground disabled:opacity-50"
              >
                {t("pr.subscribe", { price: money(businessPlan) })}
              </button>
            )}
          </div>
        </div>


        <section className="mt-6 overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5">
          <div className="bg-ink p-5 text-ink-foreground">
            <div className="text-[11px] opacity-70">{t("pr.section")}</div>
            <div className="mt-1 text-[32px] leading-none font-extrabold tracking-tight">
              {money(proPlan)} <span className="text-[15px] font-bold opacity-70">{t("pr.perMonth")}</span>
            </div>
            <div className="mt-1.5 text-[11px] opacity-70">
              {t("pr.sectionNote",{n:proPlan?.invoiceLimit ?? 1000})}
            </div>
          </div>
          <ul className="space-y-2 p-4">
            {proFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[13px]">
                <span className="mt-0.5 text-brand">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="p-4 pt-0">
            {isPro ? (
              <div className="rounded-xl bg-brand-soft/50 p-3 text-center text-[13px] font-bold">
                {t("pr.subscribed")}
              </div>
            ) : (
              <>
                <div className="mb-3 rounded-xl border border-border p-3">
                  <div className="text-[12px] font-bold">{t("pr.payMethod")}</div>
                  {providers.length === 0 ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("pr.noGateway")}
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {providers.map((pr) => (
                        <label key={pr.id} className="flex items-center gap-2 text-[13px]">
                          <input
                            type="radio"
                            name="payment-provider"
                            checked={provider === pr.id}
                            onChange={() => setProvider(pr.id)}
                          />
                          <span className="font-semibold">{pr.displayName}</span>
                          {!pr.recurring && (
                            <span className="text-[10px] text-muted-foreground">
                              {t("pr.oneTime")}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void subscribe()}
                  disabled={providers.length === 0 || starting}
                  className="w-full rounded-xl bg-brand py-3.5 text-[14px] font-extrabold text-primary-foreground disabled:opacity-50"
                >
                  {starting ? t("pr.redirecting") : t("pr.subscribe",{price:money(proPlan)})}
                </button>
              </>
            )}
            {usage && usage.kind === "guest" && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {t("pr.noAccount")}{" "}
                <Link to="/signup" className="font-bold text-brand">
                  {t("pr.freeSignupLink")}
                </Link>{" "}
                {t("pr.freeSignupNote",{n:freePlan?.invoiceLimit ?? 5})}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getUsageState, type UsageState } from "@/lib/usage.functions";
import { listPublicPlans, type Plan } from "@/lib/subscriptions.functions";

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

const PRO_FEATURES = [
  "1000 فاتورة شهريًا",
  "حفظ الفواتير في حسابك",
  "سجل الفواتير والأرشيف الشهري",
  "الرجوع إلى الفواتير السابقة في أي وقت",
  "المراجعة اليدوية وتعديل البيانات",
  "تحليل الفواتير بالذكاء الاصطناعي (مطبوع + خط يد)",
  "تصدير Excel و CSV و PDF",
  "جميع مزايا الخدمة",
];

function Pricing() {
  const usageFn = useServerFn(getUsageState);
  const plansFn = useServerFn(listPublicPlans);
  const providersFn = useServerFn(listAvailablePaymentProviders);
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
  const proFeatures = proPlan?.features.length ? proPlan.features : PRO_FEATURES;

  const subscribe = () => {
    const chosen = providers.find((p) => p.id === provider);
    if (!chosen) {
      toast.error("اختر طريقة دفع متاحة أولًا.");
      return;
    }
    toast.info(`سيتم تحويلك إلى ${chosen.displayName} لإتمام الدفع.`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-brand text-base leading-none font-extrabold text-primary-foreground">
              دف
            </div>
            <div className="leading-none">
              <div className="text-[15px] font-extrabold tracking-tight">دفتر</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">الخطط والاشتراك</div>
            </div>
          </Link>
          <Link
            to="/dashboard"
            className="rounded-full bg-surface px-3 py-1.5 text-[11px] font-bold ring-1 ring-black/5"
          >
            العودة للوحة
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-8 pb-16">
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight text-balance">
          اختر الخطة المناسبة لحجم فواتيرك
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          جرّب مجانًا بدون حساب، أو أنشئ حسابًا مجانيًا، وارتقِ إلى Pro لحفظ فواتيرك وأرشفتها
          شهريًا.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
            <div className="text-[13px] font-extrabold">Guest</div>
            <div className="mt-1 text-[20px] font-extrabold">مجانًا</div>
            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <li>• فاتورتان للتجربة</li>
              <li>• بدون حفظ دائم</li>
              <li>• تحليل AI وتصدير</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
            <div className="text-[13px] font-extrabold">Free</div>
            <div className="mt-1 text-[20px] font-extrabold">مجانًا</div>
            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <li>• {freePlan?.invoiceLimit ?? 5} فواتير شهريًا</li>
              <li>• يتجدّد الرصيد كل شهر</li>
              <li>• بدون حفظ دائم للفواتير</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-ink p-4 text-ink-foreground ring-1 ring-black/5">
            <div className="text-[13px] font-extrabold">Pro</div>
            <div className="mt-1 text-[20px] font-extrabold">
              {money(proPlan)} <span className="text-[12px] font-bold opacity-70">/ شهر</span>
            </div>
            <ul className="mt-2 space-y-1 text-[11px] opacity-80">
              <li>• {proPlan?.invoiceLimit ?? 1000} فاتورة شهريًا</li>
              <li>• حفظ وأرشفة شهرية</li>
              <li>• كل المزايا</li>
            </ul>
          </div>
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5">
          <div className="bg-ink p-5 text-ink-foreground">
            <div className="text-[11px] opacity-70">الخطة الاحترافية</div>
            <div className="mt-1 text-[32px] leading-none font-extrabold tracking-tight">
              {money(proPlan)} <span className="text-[15px] font-bold opacity-70">/ شهر</span>
            </div>
            <div className="mt-1.5 text-[11px] opacity-70">
              {proPlan?.invoiceLimit ?? 1000} فاتورة شهريًا · حفظ وأرشفة · إلغاء في أي وقت
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
                أنت مشترك في Pro — استمتع بكامل المزايا
              </div>
            ) : (
              <>
                <div className="mb-3 rounded-xl border border-border p-3">
                  <div className="text-[12px] font-bold">طريقة الدفع</div>
                  {providers.length === 0 ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      لا توجد بوابة دفع مفعّلة حاليًا — تواصل معنا لإتمام الاشتراك.
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
                              (دفع لدورة واحدة — بدون تجديد تلقائي)
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={subscribe}
                  disabled={providers.length === 0}
                  className="w-full rounded-xl bg-brand py-3.5 text-[14px] font-extrabold text-primary-foreground disabled:opacity-50"
                >
                  اشترك الآن — {money(proPlan)}/شهر
                </button>
              </>
            )}
            {usage && usage.kind === "guest" && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                ليس لديك حساب؟{" "}
                <Link to="/signup" className="font-bold text-brand">
                  أنشئ حسابًا مجانيًا
                </Link>{" "}
                واحصل على {freePlan?.invoiceLimit ?? 5} فواتير شهريًا.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, LanguageSwitcher, type Lang } from "@/lib/i18n";
import {
  getMySubscription,
  cancelMySubscription,
  reactivateMySubscription,
  type MySubscription,
} from "@/lib/subscriptions.functions";

export const Route = createFileRoute("/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الاشتراك والفوترة — دفتر" },
      {
        name: "description",
        content:
          "اعرض باقتك الحالية وحالة اشتراكك وعدد الفواتير المستخدمة والمتبقية، وأدر التجديد أو الترقية.",
      },
      { property: "og:title", content: "الاشتراك والفوترة — دفتر" },
      {
        property: "og:description",
        content: "إدارة باقتك: الاستهلاك الشهري، تاريخ التجديد، الإلغاء وإعادة التفعيل.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const localeOf = (lang: Lang) => (lang === "en" ? "en-US" : lang === "tr" ? "tr-TR" : "ar-EG");

const fmtDate = (iso: string | null, lang: Lang) =>
  iso
    ? new Date(iso).toLocaleDateString(localeOf(lang), {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

const daysLeft = (iso: string | null) =>
  iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)) : null;

function SettingsPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const subFn = useServerFn(getMySubscription);
  const cancelFn = useServerFn(cancelMySubscription);
  const reactivateFn = useServerFn(reactivateMySubscription);

  const [sub, setSub] = useState<MySubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await subFn();
      setSub(data);
    } catch {
      setSub(null);
    } finally {
      setLoading(false);
    }
  }, [subFn]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        void navigate({ to: "/login", replace: true });
        return;
      }
      await load();
    })();
  }, [load, navigate]);

  // تحديث تلقائي دوري ليبقى العرض مطابقًا لحالة الخادم
  useEffect(() => {
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const used = sub?.invoiceUsed ?? 0;
  const limit = sub?.invoiceLimit ?? 0;
  const remaining = Math.max(0, limit - used);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const exhausted = limit > 0 && used >= limit;
  const near = !exhausted && pct >= 80;
  const isPro = (sub?.plan ?? "free") !== "free";
  const expired = sub?.status === "expired" || sub?.status === "cancelled";
  const left = daysLeft(sub?.end ?? null);

  const statusLabel = (() => {
    switch (sub?.status) {
      case "active":
        return t("sub.st.active");
      case "expired":
        return t("sub.st.expired");
      case "cancelled":
        return t("sub.st.cancelled");
      default:
        return t("sub.st.inactive");
    }
  })();

  const price =
    sub && sub.planPriceCents > 0
      ? new Intl.NumberFormat(localeOf(lang), {
          style: "currency",
          currency: sub.planCurrency || "USD",
          maximumFractionDigits: 2,
        }).format(sub.planPriceCents / 100)
      : null;

  const doCancel = async () => {
    setBusy(true);
    try {
      await cancelFn();
      toast.success(t("sub.toast.cancelled"));
      setConfirmOpen(false);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doReactivate = async () => {
    setBusy(true);
    try {
      await reactivateFn();
      toast.success(t("sub.toast.reactivated"));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3">
          <div className="text-[15px] font-extrabold tracking-tight">{t("settings.title")}</div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link
              to="/dashboard"
              className="rounded-full bg-surface px-3 py-1.5 text-[11px] font-bold ring-1 ring-black/5"
            >
              {t("settings.back")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <section className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
          <h1 className="text-[20px] font-extrabold tracking-tight">{t("sub.title")}</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">{t("sub.subtitle")}</p>

          {loading ? (
            <div className="mt-6 h-24 animate-pulse rounded-xl bg-brand-soft/40" />
          ) : !sub ? (
            <p className="mt-6 text-[13px] font-semibold">{t("sub.noSub")}</p>
          ) : (
            <>
              <dl className="mt-5 grid grid-cols-2 gap-3">
                <Cell label={t("sub.currentPlan")} value={sub.planName} strong />
                <Cell label={t("sub.status")} value={statusLabel} strong />
                <Cell label={t("sub.start")} value={fmtDate(sub.start, lang)} />
                <Cell
                  label={sub.cancelAtPeriodEnd || expired ? t("sub.end") : t("sub.renewal")}
                  value={fmtDate(sub.end, lang)}
                />
                <Cell
                  label={t("sub.daysLeft")}
                  value={left === null ? "—" : `${left} ${t("sub.days")}`}
                />
                {price && <Cell label={t("sub.price")} value={price} />}
              </dl>

              {/* الاستهلاك */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-[12px] font-bold">
                  <span>{t("sub.usage")}</span>
                  <span dir="ltr">
                    {used} / {limit}
                  </span>
                </div>
                <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-brand-soft/60">
                  <div
                    className={`h-full rounded-full transition-all ${
                      exhausted ? "bg-destructive" : near ? "bg-amber-500" : "bg-brand"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {t("sub.remaining")}: {remaining} {t("sub.invoicesWord")}
                  </span>
                  <span dir="ltr">{pct}%</span>
                </div>
              </div>

              {near && (
                <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] font-semibold text-amber-700">
                  {t("sub.nearLimit")}
                </p>
              )}

              {(exhausted || expired) && (
                <div className="mt-4 rounded-xl bg-destructive/10 px-3 py-3">
                  <p className="text-[12px] font-semibold text-destructive">
                    {t("sub.limitReached")}
                  </p>
                  <Link
                    to="/pricing"
                    className="mt-3 inline-block rounded-full bg-brand px-4 py-1.5 text-[12px] font-bold text-primary-foreground"
                  >
                    {expired ? t("sub.renew") : t("sub.upgrade")}
                  </Link>
                </div>
              )}

              {sub.cancelAtPeriodEnd && (
                <p className="mt-4 rounded-xl bg-brand-soft/50 px-3 py-2 text-[12px] font-semibold">
                  {t("sub.cancelledUntil").replace("{date}", fmtDate(sub.end, lang))}
                </p>
              )}

              <p className="mt-4 text-[11px] text-muted-foreground">{t("sub.unlimitedNote")}</p>

              <div className="mt-5 flex flex-wrap gap-2">
                {!isPro && (
                  <>
                    <span className="text-[12px] font-semibold text-muted-foreground">
                      {t("sub.free.note")}
                    </span>
                    <Link
                      to="/pricing"
                      className="rounded-full bg-brand px-4 py-1.5 text-[12px] font-bold text-primary-foreground"
                    >
                      {t("sub.upgrade")}
                    </Link>
                  </>
                )}

                {isPro && sub.status === "active" && !sub.cancelAtPeriodEnd && (
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    className="rounded-full bg-surface px-4 py-1.5 text-[12px] font-bold text-destructive ring-1 ring-destructive/30"
                  >
                    {t("sub.cancel")}
                  </button>
                )}

                {isPro && sub.cancelAtPeriodEnd && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void doReactivate()}
                    className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-bold text-ink-foreground disabled:opacity-60"
                  >
                    {t("sub.reactivate")}
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </main>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-background p-4 shadow-xl">
            <h2 className="text-[15px] font-extrabold">{t("sub.cancelTitle")}</h2>
            <p className="mt-2 text-[12px] text-muted-foreground">{t("sub.cancelBody")}</p>
            {sub?.end && (
              <p className="mt-2 text-[12px] font-semibold">
                {t("sub.cancelledUntil").replace("{date}", fmtDate(sub.end, lang))}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-full bg-surface px-4 py-1.5 text-[12px] font-bold ring-1 ring-black/5"
              >
                {t("sub.cancelBack")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void doCancel()}
                className="rounded-full bg-destructive px-4 py-1.5 text-[12px] font-bold text-destructive-foreground disabled:opacity-60"
              >
                {t("sub.cancelConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-brand-soft/35 px-3 py-2">
      <dt className="text-[10px] font-semibold text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-[13px] ${strong ? "font-extrabold" : "font-semibold"}`}>
        {value}
      </dd>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { LanguageSwitcher, useI18n } from "@/lib/i18n";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "دفتر — قراءة فواتير المشتريات بالذكاء الاصطناعي" },
      {
        name: "description",
        content:
          "ارفع فواتير مشترياتك ويقوم دفتر بقراءتها بالـAI/OCR واستخراج الموردين والمنتجات والأسعار وحساب المجموع والضريبة في تقرير جاهز للتصدير.",
      },
      { property: "og:title", content: "دفتر — قراءة فواتير المشتريات بالذكاء الاصطناعي" },
      {
        property: "og:description",
        content: "ارفع أي عدد من الفواتير واحصل على سِجِلّ منظّم وتقرير بالمجاميع والضرائب.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useI18n();
  const features = [
    [t("landing.f1.t"), t("landing.f1.b")],
    [t("landing.f2.t"), t("landing.f2.b")],
    [t("landing.f3.t"), t("landing.f3.b")],
    [t("landing.f4.t"), t("landing.f4.b")],
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-brand text-base leading-none font-extrabold text-primary-foreground">
              {t("brand.mark")}
            </div>
            <div className="leading-none">
              <div className="text-[15px] font-extrabold tracking-tight">{t("brand.name")}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{t("brand.tagline")}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link
              to="/login"
              className="rounded-full px-3 py-1.5 text-[12px] font-bold text-foreground"
            >
              {t("nav.login")}
            </Link>
            <Link
              to="/dashboard"
              className="rounded-full bg-brand px-3 py-1.5 text-[12px] font-bold text-primary-foreground"
            >
              {t("nav.tryFree")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-10 pb-14">
        <section className="animate-rise">
          <div className="text-[11px] font-semibold text-brand">{t("landing.kicker")}</div>
          <h1 className="mt-1 text-[30px] leading-[1.15] font-extrabold tracking-tight text-balance">
            {t("landing.title")}
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
            {t("landing.subtitle")}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/dashboard"
              className="rounded-xl bg-brand px-5 py-2.5 text-[14px] font-extrabold text-primary-foreground"
            >
              {t("nav.tryFree")}
            </Link>
            <Link
              to="/signup"
              className="rounded-xl border border-border px-5 py-2.5 text-[14px] font-extrabold"
            >
              {t("nav.signup")}
            </Link>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{t("landing.note")}</p>
        </section>

        <section className="mt-10 grid gap-3 sm:grid-cols-2">
          {features.map(([title, body]) => (
            <div key={title} className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
              <h2 className="text-[14px] font-extrabold">{title}</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>

        <section className="mt-10 rounded-2xl bg-ink p-5 text-ink-foreground">
          <div className="text-[11px] opacity-70">{t("landing.how")}</div>
          <ol className="mt-2 space-y-1.5 text-[13px] font-semibold">
            <li>{t("landing.s1")}</li>
            <li>{t("landing.s2")}</li>
            <li>{t("landing.s3")}</li>
            <li>{t("landing.s4")}</li>
          </ol>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

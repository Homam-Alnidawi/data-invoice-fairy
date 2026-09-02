import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { SiteFooter } from "@/components/site-footer";

export function LegalShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-brand text-base leading-none font-extrabold text-primary-foreground">
              {t("brand.mark")}
            </div>
            <div className="leading-none">
              <div className="text-[15px] font-extrabold tracking-tight">{t("brand.name")}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{t("brand.tagline")}</div>
            </div>
          </Link>
          <Link
            to="/"
            className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-[11px] font-bold ring-1 ring-black/5"
          >
            {t("ft.home")}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-4">
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight text-balance">
          {title}
        </h1>
        {lead && <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{lead}</p>}
        <div className="mt-6">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}

export function LegalBody({ paragraphs }: { paragraphs: string[] }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl bg-surface p-5 ring-1 ring-black/5">
      <div className="text-[11px] text-muted-foreground">{t("legal.updated")}</div>
      <div className="mt-3 space-y-3">
        {paragraphs.map((p) => (
          <p key={p} className="text-[13px] leading-relaxed text-foreground/85">
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}

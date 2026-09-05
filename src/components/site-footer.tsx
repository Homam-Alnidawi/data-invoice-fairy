import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { useI18n } from "@/lib/i18n";

export const SUPPORT_EMAIL = "aiinvoice15@gmail.com";

function MastercardMark() {
  return (
    <svg viewBox="0 0 48 30" className="h-5 w-8" role="img" aria-label="Mastercard">
      <circle cx="19" cy="15" r="10" fill="currentColor" opacity="0.85" />
      <circle cx="30" cy="15" r="10" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

function PaypalMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" role="img" aria-label="PayPal" fill="currentColor">
      <path d="M7.4 21.2H4.6c-.4 0-.7-.4-.6-.8L6.7 3.6c.1-.4.4-.6.8-.6h5.9c3.3 0 5.4 1.7 4.9 5-.5 3.4-3 5-6.2 5H9.5c-.4 0-.7.3-.8.7l-.6 6.8c0 .4-.3.7-.7.7Z" opacity="0.55" />
      <path d="M10.6 23h-2.4c-.4 0-.7-.3-.6-.7l.5-3.4c.1-.4.4-.6.8-.6h1.9c3.2 0 5.7-1.6 6.2-5 .1-.6.1-1.2 0-1.7 1.6.7 2.4 2.2 2 4.5-.5 3.4-3 5-6.2 5h-1.3c-.4 0-.7.3-.8.7l-.1.9c0 .2-.1.3-.2.3Z" />
    </svg>
  );
}


function PayBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[11px] font-extrabold tracking-wide text-foreground/80 transition-colors hover:border-brand hover:text-foreground">
      {children}
    </span>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-extrabold tracking-wide text-foreground uppercase">
        {title}
      </h3>
      <ul className="mt-3 space-y-2">{children}</ul>
    </div>
  );
}

const linkCls =
  "text-[13px] text-muted-foreground transition-colors hover:text-brand focus-visible:text-brand";

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <BrandMark />
              <div className="leading-none">
                <div className="text-[15px] font-extrabold tracking-tight">{t("brand.name")}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {t("brand.tagline")}
                </div>
              </div>
            </div>
            <p className="mt-3 max-w-xs text-[12px] leading-relaxed text-muted-foreground">
              {t("ft.tagline")}
            </p>
          </div>

          <Column title={t("ft.service")}>
            <li>
              <Link to="/" className={linkCls}>
                {t("ft.home")}
              </Link>
            </li>
            <li>
              <Link to="/pricing" className={linkCls}>
                {t("ft.pricing")}
              </Link>
            </li>
            <li>
              <Link to="/faq" className={linkCls}>
                {t("ft.faq")}
              </Link>
            </li>
          </Column>

          <Column title={t("ft.support")}>
            <li>
              <Link to="/contact" className={linkCls}>
                {t("ft.contact")}
              </Link>
            </li>
            <li>
              <a href={`mailto:${SUPPORT_EMAIL}`} className={linkCls} dir="ltr">
                {SUPPORT_EMAIL}
              </a>
            </li>
          </Column>

          <Column title={t("ft.legal")}>
            <li>
              <Link to="/privacy" className={linkCls}>
                {t("ft.privacy")}
              </Link>
            </li>
            <li>
              <Link to="/terms" className={linkCls}>
                {t("ft.terms")}
              </Link>
            </li>
            <li>
              <Link to="/refund" className={linkCls}>
                {t("ft.refund")}
              </Link>
            </li>
          </Column>
        </div>

        <div className="mt-8 border-t border-border pt-6">
          <h3 className="text-[11px] font-extrabold tracking-wide text-foreground uppercase">
            {t("ft.payments")}
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PayBadge>VISA</PayBadge>
            <PayBadge>
              <MastercardMark />
              <span className="hidden sm:inline">Mastercard</span>
            </PayBadge>
            <PayBadge>Zain Cash</PayBadge>
            <PayBadge>
              <PaypalMark />
              <span>PayPal</span>
            </PayBadge>
          </div>

        </div>

        <div className="mt-8 border-t border-border pt-5 text-center text-[11px] text-muted-foreground">
          {t("ft.rights")}
        </div>
      </div>
    </footer>
  );
}

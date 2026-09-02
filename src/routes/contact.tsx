import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { LegalShell } from "@/components/legal-shell";
import { SUPPORT_EMAIL } from "@/components/site-footer";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "اتصل بنا — دعم دفتر لقراءة الفواتير" },
      {
        name: "description",
        content:
          "تواصل مع فريق دفتر للدعم الفني والاستفسارات حول الاشتراكات والفواتير عبر البريد الإلكتروني aiinvoice15@gmail.com.",
      },
      { property: "og:title", content: "اتصل بنا — دفتر" },
      { property: "og:description", content: "الدعم الفني واستفسارات الاشتراكات عبر البريد." },
    ],
  }),
  component: Contact,
});

function Contact() {
  const { t } = useI18n();
  return (
    <LegalShell title={t("contact.title")} lead={t("contact.lead")}>
      <div className="rounded-2xl bg-surface p-5 ring-1 ring-black/5">
        <div className="text-[11px] text-muted-foreground">{t("ft.emailLabel")}</div>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          dir="ltr"
          className="mt-1 block text-[16px] font-extrabold break-all text-brand hover:underline"
        >
          {SUPPORT_EMAIL}
        </a>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="mt-4 inline-block rounded-xl bg-brand px-5 py-2.5 text-[13px] font-extrabold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t("contact.emailUs")}
        </a>
      </div>
    </LegalShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { LegalShell, LegalBody } from "@/components/legal-shell";

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: [
      { title: "سياسة الاسترداد والدفع — دفتر" },
      {
        name: "description",
        content:
          "طريقة الدفع والتجديد وإيقافه في دفتر، وحالات استرداد المبالغ عند الخصم المزدوج أو الأعطال التقنية.",
      },
      { property: "og:title", content: "سياسة الاسترداد والدفع — دفتر" },
      { property: "og:description", content: "الدفع الشهري، إيقاف التجديد، وحالات الاسترداد." },
    ],
  }),
  component: Refund,
});

function Refund() {
  const { t } = useI18n();
  return (
    <LegalShell title={t("refund.title")}>
      <LegalBody paragraphs={[t("refund.p1"), t("refund.p2"), t("refund.p3"), t("refund.p4")]} />
    </LegalShell>
  );
}

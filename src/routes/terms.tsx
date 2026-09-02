import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { LegalShell, LegalBody } from "@/components/legal-shell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "الشروط والأحكام — دفتر لقراءة الفواتير" },
      {
        name: "description",
        content:
          "شروط استخدام دفتر: مسؤوليات المستخدم عند رفع الفواتير، حدود دقة الاستخراج بالذكاء الاصطناعي، وقواعد الباقات.",
      },
      { property: "og:title", content: "الشروط والأحكام — دفتر" },
      { property: "og:description", content: "قواعد الاستخدام والمسؤوليات وحدود الخدمة." },
    ],
  }),
  component: Terms,
});

function Terms() {
  const { t } = useI18n();
  return (
    <LegalShell title={t("terms.title")}>
      <LegalBody paragraphs={[t("terms.p1"), t("terms.p2"), t("terms.p3"), t("terms.p4")]} />
    </LegalShell>
  );
}

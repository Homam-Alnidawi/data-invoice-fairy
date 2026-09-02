import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { LegalShell, LegalBody } from "@/components/legal-shell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية — دفتر لقراءة الفواتير" },
      {
        name: "description",
        content:
          "كيف يجمع دفتر بياناتك ويعالج الفواتير المرفوعة ويحميها، ومع من تُشارك، وكيف يمكنك حذف بياناتك أو حسابك.",
      },
      { property: "og:title", content: "سياسة الخصوصية — دفتر" },
      { property: "og:description", content: "جمع البيانات ومعالجة الفواتير وحقوق الحذف." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  const { t } = useI18n();
  return (
    <LegalShell title={t("privacy.title")}>
      <LegalBody paragraphs={[t("privacy.p1"), t("privacy.p2"), t("privacy.p3"), t("privacy.p4")]} />
    </LegalShell>
  );
}

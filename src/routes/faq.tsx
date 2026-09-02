import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { LegalShell } from "@/components/legal-shell";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "الأسئلة الشائعة — دفتر لقراءة الفواتير" },
      {
        name: "description",
        content:
          "إجابات عن الأسئلة الشائعة حول دفتر: كيفية قراءة الفواتير بالذكاء الاصطناعي، دعم خط اليد، الباقات، حفظ الفواتير، وصيغ التصدير.",
      },
      { property: "og:title", content: "الأسئلة الشائعة — دفتر" },
      {
        property: "og:description",
        content: "كل ما تحتاج معرفته عن قراءة الفواتير بالذكاء الاصطناعي والباقات والتصدير.",
      },
    ],
  }),
  component: Faq,
});

function Faq() {
  const { t } = useI18n();
  const items = [1, 2, 3, 4, 5, 6].map((n) => [t(`faq.q${n}`), t(`faq.a${n}`)] as const);

  return (
    <LegalShell title={t("faq.title")} lead={t("faq.lead")}>
      <div className="space-y-3">
        {items.map(([q, a]) => (
          <div key={q} className="rounded-2xl bg-surface p-4 ring-1 ring-black/5">
            <h2 className="text-[14px] font-extrabold">{q}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{a}</p>
          </div>
        ))}
      </div>
    </LegalShell>
  );
}

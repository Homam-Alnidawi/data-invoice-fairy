import { createFileRoute, Link } from "@tanstack/react-router";

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

const features = [
  ["قراءة مطبوع وخط اليد", "AI/OCR يقرأ الفواتير المطبوعة والمكتوبة يدويًا ويستخرج كل الحقول."],
  ["استخراج كامل", "المورد، رقم الفاتورة، التاريخ، المنتجات، الكمية، السعر، الخصم، KDV، الإجمالي."],
  ["تحقق حسابي", "مقارنة مجموع البنود بالصافي والضريبة، وتعليم الفواتير التي تحتاج مراجعة."],
  ["تقارير جاهزة", "تصدير Excel بورقتَي الفواتير والبنود، إضافة إلى CSV و PDF."],
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-brand text-base leading-none font-extrabold text-primary-foreground">
              دف
            </div>
            <div className="leading-none">
              <div className="text-[15px] font-extrabold tracking-tight">دفتر</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                فواتير المشتريات الذكية
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-full px-3 py-1.5 text-[12px] font-bold text-foreground"
            >
              تسجيل الدخول
            </Link>
            <Link
              to="/dashboard"
              className="rounded-full bg-brand px-3 py-1.5 text-[12px] font-bold text-primary-foreground"
            >
              جرب مجانًا
            </Link>

          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-10 pb-20">
        <section className="animate-rise">
          <div className="text-[11px] font-semibold text-brand">Invoice AI</div>
          <h1 className="mt-1 text-[30px] leading-[1.15] font-extrabold tracking-tight text-balance">
            ارفع فواتير مشترياتك، واستلم تقريرًا محاسبيًا جاهزًا
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
            دفتر يقرأ فواتيرك بالذكاء الاصطناعي، يستخرج الموردين والمنتجات والأسعار، يتحقق من
            الحسابات، ويحسب الضريبة والإجمالي — ثم يصدّر التقرير إلى Excel أو CSV أو PDF.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/dashboard"
              className="rounded-xl bg-brand px-5 py-2.5 text-[14px] font-extrabold text-primary-foreground"
            >
              جرب مجانًا
            </Link>
            <Link
              to="/pricing"
              className="rounded-xl border border-border px-5 py-2.5 text-[14px] font-extrabold"
            >
              الأسعار
            </Link>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            جرّب فاتورتين مجانًا بدون حساب · حساب مجاني = 5 فواتير شهريًا · Pro = 1000 فاتورة
            شهريًا.
          </p>

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
          <div className="text-[11px] opacity-70">كيف يعمل</div>
          <ol className="mt-2 space-y-1.5 text-[13px] font-semibold">
            <li>1 — ارفع الفواتير (صور أو PDF)، أي عدد.</li>
            <li>2 — الذكاء الاصطناعي يقرأها ويستخرج البيانات.</li>
            <li>3 — تحقق حسابي وتعليم ما يحتاج مراجعة.</li>
            <li>4 — تقرير بالمجاميع والضرائب قابل للتصدير.</li>
          </ol>
        </section>
      </main>
    </div>
  );
}

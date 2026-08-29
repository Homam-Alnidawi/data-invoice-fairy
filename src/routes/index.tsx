import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { extractInvoice, type ExtractedInvoice } from "@/lib/invoices.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "دفتر — قراءة فواتير المشتريات بالذكاء الاصطناعي" },
      {
        name: "description",
        content:
          "ارفع حتى 1000 فاتورة مشتريات ويقوم دفتر بقراءتها بالـAI/OCR واستخراج الموردين والمنتجات والأسعار وحساب المجموع والضريبة في تقرير جاهز للتصدير.",
      },
      { property: "og:title", content: "دفتر — قراءة فواتير المشتريات بالذكاء الاصطناعي" },
      {
        property: "og:description",
        content: "ارفع حتى 1000 فاتورة واحصل على سِجِلّ منظّم وتقرير بالمجاميع والضرائب.",
      },
    ],
  }),
  component: Index,
});

const MAX_INVOICES = 1000;
const CONCURRENCY = 4;
const PAGE_SIZE = 8;

type Status = "queued" | "processing" | "done" | "review" | "error";

type Job = {
  id: string;
  fileName: string;
  status: Status;
  progress: number;
  error?: string;
  data?: ExtractedInvoice;
};

const nf = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("تعذّر قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

function Index() {
  const extract = useServerFn(extractInvoice);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [page, setPage] = useState(0);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = useCallback((id: string, next: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...next } : j)));
  }, []);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const incoming = Array.from(fileList);
      const room = MAX_INVOICES - jobs.length;
      if (room <= 0) {
        toast.error(`الحد الأقصى ${MAX_INVOICES} فاتورة`);
        return;
      }
      const files = incoming.slice(0, room);
      if (incoming.length > room) {
        toast.warning(`تم قبول ${room} فقط — الحد الأقصى ${MAX_INVOICES} فاتورة`);
      }

      const newJobs: Job[] = files.map((f, i) => ({
        id: `${Date.now()}-${i}-${f.name}`,
        fileName: f.name,
        status: "queued",
        progress: 0,
      }));
      setJobs((prev) => [...newJobs, ...prev]);
      setRunning(true);

      let cursor = 0;
      const worker = async () => {
        while (cursor < files.length) {
          const index = cursor++;
          const file = files[index]!;
          const job = newJobs[index]!;
          patch(job.id, { status: "processing", progress: 25 });
          try {
            const dataUrl = await readAsDataUrl(file);
            patch(job.id, { progress: 60 });
            const data = await extract({
              data: { fileName: file.name, mimeType: file.type, dataUrl },
            });
            patch(job.id, {
              status: data.needsReview ? "review" : "done",
              progress: 100,
              data,
            });
          } catch (err) {
            patch(job.id, {
              status: "error",
              progress: 100,
              error: err instanceof Error ? err.message : "خطأ غير معروف",
            });
          }
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      setRunning(false);
      toast.success("انتهت معالجة الدفعة");
    },
    [extract, jobs.length, patch],
  );

  const parsed = useMemo(() => jobs.filter((j) => j.data).map((j) => j.data!), [jobs]);

  const totals = useMemo(() => {
    const subtotal = parsed.reduce((s, i) => s + i.subtotal, 0);
    const tax = parsed.reduce((s, i) => s + i.tax, 0);
    const total = parsed.reduce((s, i) => s + (i.total || i.subtotal + i.tax), 0);
    const items = parsed.reduce((s, i) => s + i.items.length, 0);
    const bySupplier = new Map<string, number>();
    for (const inv of parsed) {
      bySupplier.set(inv.supplier, (bySupplier.get(inv.supplier) ?? 0) + (inv.total || 0));
    }
    const suppliers = [...bySupplier.entries()].sort((a, b) => b[1] - a[1]);
    return { subtotal, tax, total, items, suppliers };
  }, [parsed]);

  const doneCount = jobs.filter((j) => j.status === "done" || j.status === "review").length;
  const pageCount = Math.max(1, Math.ceil(parsed.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = parsed.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const maxSupplier = totals.suppliers[0]?.[1] ?? 1;

  const exportCsv = () => {
    if (parsed.length === 0) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }
    const head = [
      "المورد",
      "رقم الفاتورة",
      "التاريخ",
      "المنتج",
      "الكمية",
      "سعر الوحدة",
      "إجمالي البند",
      "الصافي",
      "الضريبة",
      "الإجمالي",
    ];
    const lines = [head.join(",")];
    for (const inv of parsed) {
      if (inv.items.length === 0) {
        lines.push(
          [
            inv.supplier,
            inv.invoiceNumber,
            inv.date,
            "",
            "",
            "",
            "",
            inv.subtotal,
            inv.tax,
            inv.total,
          ]
            .map((c) => `"${String(c).replace(/"/g, '""')}"`)
            .join(","),
        );
      }
      for (const it of inv.items) {
        lines.push(
          [
            inv.supplier,
            inv.invoiceNumber,
            inv.date,
            it.name,
            it.qty,
            it.unitPrice,
            it.total,
            inv.subtotal,
            inv.tax,
            inv.total,
          ]
            .map((c) => `"${String(c).replace(/"/g, '""')}"`)
            .join(","),
        );
      }
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "تقرير_المشتريات.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="animate-rise flex items-center gap-2">
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
          <span className="rounded-full bg-brand-soft/60 px-3 py-1 text-[11px] font-semibold">
            حتى {MAX_INVOICES} فاتورة
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-4 pb-28">
        <section>
          <div className="animate-rise mb-3">
            <div className="text-[11px] font-semibold text-brand">(أ) رفع الفواتير</div>
            <h1 className="text-[22px] leading-[1.15] font-extrabold tracking-tight text-balance">
              مرّر الفواتير، ودعها تخرج سِجلاًّ نظيفًا
            </h1>
          </div>

          <div className="animate-rise relative overflow-hidden rounded-2xl bg-surface p-3 ring-1 ring-black/5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFiles(e.dataTransfer.files);
              }}
              className="relative w-full rounded-xl border border-dashed border-brand/40 bg-brand-soft/30 p-4 text-right"
            >
              <div
                className="animate-scan pointer-events-none absolute inset-x-0 top-0 h-16"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent, color-mix(in oklch, var(--brand) 20%, transparent), transparent)",
                }}
              />
              <div className="relative flex items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-lg leading-none font-extrabold text-primary-foreground">
                  ↑
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-bold">اسحب الفواتير هنا أو اخترها</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    صور أو PDF — حتى {MAX_INVOICES} فاتورة في الدفعة
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-background/70 px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  الدفعة الحالية ·{" "}
                  <span className="font-semibold text-foreground">
                    {doneCount}/{jobs.length}
                  </span>
                </div>
                <div className="text-[11px] font-bold text-brand">
                  {running ? "جارٍ التحليل…" : jobs.length ? "مكتملة" : "بانتظار الملفات"}
                </div>
              </div>
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {jobs.length > 0 && (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  قائمة المعالجة
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {jobs.length - doneCount} متبقية
                </span>
              </div>
              <ul className="max-h-72 space-y-2 overflow-y-auto pl-1">
                {jobs.slice(0, 60).map((job) => (
                  <li
                    key={job.id}
                    className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 ring-1 ring-black/5"
                  >
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        job.status === "error"
                          ? "bg-destructive"
                          : job.status === "review"
                            ? "bg-amber"
                            : job.status === "done"
                              ? "bg-ink"
                              : "bg-brand"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{job.fileName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {job.status === "queued" && "في الانتظار"}
                        {job.status === "processing" && "معالجة OCR…"}
                        {job.status === "done" &&
                          `اكتملت · ${job.data?.items.length ?? 0} بنود`}
                        {job.status === "review" && "تحتاج مراجعة يدوية"}
                        {job.status === "error" && job.error}
                      </div>
                    </div>
                    <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full bg-brand transition-all"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="mt-6">
          <div className="mb-2 text-[11px] font-semibold text-brand">(ب) البيانات المستخرجة</div>
          <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5">
            <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-border px-3 py-2 text-[10px] font-semibold text-muted-foreground">
              <span>المورد</span>
              <span>المبلغ</span>
            </div>
            {rows.length === 0 ? (
              <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">
                لا توجد بيانات بعد — ارفع فواتيرك لتظهر هنا
              </div>
            ) : (
              rows.map((inv, i) => (
                <div
                  key={`${inv.invoiceNumber}-${i}`}
                  className="animate-rise grid grid-cols-[1fr_auto] items-center gap-2 border-b border-border px-3 py-2.5 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold">{inv.supplier}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {inv.date || "بدون تاريخ"} · {inv.items.length} بنود
                      {inv.invoiceNumber ? ` · #${inv.invoiceNumber}` : ""}
                    </div>
                  </div>
                  <div className="text-[13px] font-bold tabular-nums">{nf.format(inv.total)}</div>
                </div>
              ))
            )}
            <div className="flex items-center justify-between gap-2 bg-brand-soft/25 px-3 py-2.5 text-[11px] text-muted-foreground">
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-md px-2 py-1 font-semibold text-foreground disabled:opacity-30"
              >
                ›
              </button>
              <span>
                عرض {rows.length} من {parsed.length} · صفحة {currentPage + 1} / {pageCount}
              </span>
              <button
                type="button"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                className="rounded-md px-2 py-1 font-semibold text-foreground disabled:opacity-30"
              >
                ‹
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-2 text-[11px] font-semibold text-brand">(ج) التقرير والمجموع</div>
          <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5">
            <div className="bg-ink p-4 text-ink-foreground">
              <div className="text-[11px] opacity-70">إجمالي المشتريات (شامل الضريبة)</div>
              <div className="mt-1 text-[30px] leading-none font-extrabold tracking-tight tabular-nums">
                {nf.format(totals.total)}
                <span className="text-[15px] font-bold opacity-80"> ر.س</span>
              </div>
              <div className="mt-1.5 text-[10px] opacity-60">
                {parsed.length} فاتورة · {totals.suppliers.length} موردًا · {totals.items} بندًا
              </div>
            </div>

            <div className="space-y-2.5 p-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">المجموع قبل الضريبة</span>
                <span className="font-bold tabular-nums">{nf.format(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">ضريبة القيمة المضافة</span>
                <span className="font-bold text-brand tabular-nums">{nf.format(totals.tax)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2.5 text-[13px]">
                <span className="font-semibold">الإجمالي</span>
                <span className="font-extrabold text-brand tabular-nums">
                  {nf.format(totals.total)}
                </span>
              </div>

              {totals.suppliers.length > 0 && (
                <div className="pt-1">
                  <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
                    أعلى الموردين
                  </div>
                  <div className="space-y-1.5">
                    {totals.suppliers.slice(0, 5).map(([name, amount]) => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="w-24 shrink-0 truncate text-[11px]">{name}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${Math.max(4, (amount / maxSupplier) * 100)}%` }}
                          />
                        </div>
                        <span className="w-16 text-left text-[11px] font-semibold tabular-nums">
                          {nf.format(amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <p className="mt-5 text-center text-[10px] text-muted-foreground">
          دفتر · قِراءة الفواتير بالذكاء الاصطناعي وتحويلها إلى سِجِلّ قابل للتصدير
        </p>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="leading-tight">
            <div className="text-[10px] text-muted-foreground">الإجمالي · الضريبة</div>
            <div className="text-[16px] font-extrabold tracking-tight tabular-nums">
              {nf.format(totals.total)}
              <span className="text-[11px] font-bold text-brand"> · ض {nf.format(totals.tax)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-primary-foreground transition-colors active:bg-brand/90"
          >
            تصدير التقرير
          </button>
        </div>
      </div>
    </div>
  );
}

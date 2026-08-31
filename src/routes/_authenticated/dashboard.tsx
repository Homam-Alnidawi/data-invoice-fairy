import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  extractInvoice,
  type ExtractedInvoice,
  type InvoiceItem,
} from "@/lib/invoices.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم — دفتر" },
      {
        name: "description",
        content:
          "ارفع فواتير مشترياتك بلا حدّ أقصى ويقوم دفتر بقراءتها بالـAI/OCR واستخراج الموردين والمنتجات والأسعار وحساب المجموع والضريبة في تقرير جاهز للتصدير.",
      },
      { property: "og:title", content: "دفتر — قراءة فواتير المشتريات بالذكاء الاصطناعي" },
      {
        property: "og:description",
        content: "ارفع أي عدد من الفواتير واحصل على سِجِلّ منظّم وتقرير بالمجاميع والضرائب.",
      },
    ],
  }),
  component: Index,
});


const CONCURRENCY = 4;
const PAGE_SIZE = 8;

type Status = "queued" | "processing" | "done" | "review" | "rejected" | "error";

type Job = {
  id: string;
  fileName: string;
  status: Status;
  progress: number;
  error?: string;
  previewUrl?: string;
  data?: ExtractedInvoice;
};

const nf = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "غير معروف");

const statusLabel: Record<Status, string> = {
  queued: "في الانتظار",
  processing: "Processing",
  done: "Completed",
  review: "Needs Review",
  rejected: "Rejected",
  error: "Rejected",
};

function currencySymbol(code: string | null) {
  if (!code) return "";
  const c = code.toUpperCase();
  if (c === "TRY" || c === "TL") return "₺";
  if (c === "SAR") return "ر.س";
  if (c === "USD") return "$";
  if (c === "EUR") return "€";
  return code;
}

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
  const [reviewId, setReviewId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = useCallback((id: string, next: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...next } : j)));
  }, []);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);

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
            patch(job.id, {
              progress: 60,
              ...(file.type.startsWith("image/") ? { previewUrl: dataUrl } : {}),
            });

            const data = await extract({
              data: { fileName: file.name, mimeType: file.type, dataUrl },
            });
            patch(job.id, {
              status:
                data.status === "completed"
                  ? "done"
                  : data.status === "rejected"
                    ? "rejected"
                    : "review",
              progress: 100,
              data,
            });
          } catch (err) {
            // فشل فاتورة واحدة لا يوقف البقية
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
    [extract, patch],
  );

  const parsedJobs = useMemo(
    () => jobs.filter((j) => j.data && j.data.status !== "rejected"),
    [jobs],
  );
  const parsed = useMemo(() => parsedJobs.map((j) => j.data!), [parsedJobs]);
  const reviewJobs = useMemo(
    () => jobs.filter((j) => j.status === "review" || j.status === "rejected"),
    [jobs],
  );

  const totals = useMemo(() => {
    const subtotal = parsed.reduce((s, i) => s + i.subtotal, 0);
    const tax = parsed.reduce((s, i) => s + i.tax, 0);
    const total = parsed.reduce((s, i) => s + (i.total || i.subtotal + i.tax), 0);
    const items = parsed.reduce((s, i) => s + i.items.length, 0);
    const bySupplier = new Map<string, number>();
    for (const inv of parsed) {
      const name = dash(inv.supplier);
      bySupplier.set(name, (bySupplier.get(name) ?? 0) + (inv.total || 0));
    }
    const suppliers = [...bySupplier.entries()].sort((a, b) => b[1] - a[1]);
    const currency = parsed.find((i) => i.currency)?.currency ?? null;
    return { subtotal, tax, total, items, suppliers, currency };
  }, [parsed]);

  const doneCount = jobs.filter(
    (j) => j.status === "done" || j.status === "review" || j.status === "rejected",
  ).length;
  const pageCount = Math.max(1, Math.ceil(parsed.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = parsedJobs.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const maxSupplier = totals.suppliers[0]?.[1] ?? 1;

  const INVOICES_HEAD = [
    "رقم الفاتورة",
    "التاريخ",
    "المورد",
    "العملة",
    "الصافي",
    "الضريبة KDV",
    "الإجمالي",
    "الحالة",
  ];

  const ITEMS_HEAD = [
    "رقم الفاتورة",
    "المورد",
    "المنتج",
    "الكمية",
    "سعر الوحدة",
    "الخصم",
    "إجمالي البند",
  ];

  const buildInvoiceRows = (): string[][] =>
    parsedJobs.map((j) => {
      const inv = j.data!;
      return [
        dash(inv.invoiceNumber),
        dash(inv.date),
        dash(inv.supplier),
        inv.currency ?? "عملة غير محددة",
        String(inv.subtotal),
        String(inv.tax),
        String(inv.total),
        statusLabel[j.status],
      ];
    });

  const buildItemRows = (): string[][] => {
    const out: string[][] = [];
    for (const inv of parsed) {
      for (const it of inv.items) {
        out.push([
          dash(inv.invoiceNumber),
          dash(inv.supplier),
          it.name,
          String(it.qty),
          String(it.unitPrice),
          String(it.discount ?? 0),
          String(it.total),
        ]);
      }
    }
    return out;
  };

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const hasData = () => {
    if (parsed.length === 0) {
      toast.error("لا توجد بيانات للتصدير — ارفع فواتير أولًا");
      return false;
    }
    return true;
  };

  const csvBlob = (head: string[], rows: string[][]) => {
    const esc = (c: string) => `"${c.replace(/"/g, '""')}"`;
    const lines = [head.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
    return new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  };

  const exportCsv = () => {
    if (!hasData()) return;
    download(csvBlob(INVOICES_HEAD, buildInvoiceRows()), "الفواتير.csv");
    setTimeout(() => download(csvBlob(ITEMS_HEAD, buildItemRows()), "البنود.csv"), 600);
    toast.success("تم تصدير ملفين: الفواتير + البنود");
  };

  const tableHtml = (head: string[], rows: string[][], footer?: string) => {
    const esc = (c: string) =>
      c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const body = rows
      .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("");
    return `<table border="1" cellspacing="0" cellpadding="4" dir="rtl">
      <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${body}</tbody>
      ${footer ? `<tfoot>${footer}</tfoot>` : ""}
    </table>`;
  };

  const exportExcel = async () => {
    if (!hasData()) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    const wsInv = XLSX.utils.aoa_to_sheet([INVOICES_HEAD, ...buildInvoiceRows()]);
    wsInv["!cols"] = INVOICES_HEAD.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, wsInv, "Invoices");

    const wsItems = XLSX.utils.aoa_to_sheet([ITEMS_HEAD, ...buildItemRows()]);
    wsItems["!cols"] = [
      { wch: 16 },
      { wch: 22 },
      { wch: 34 },
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, wsItems, "Items");

    XLSX.writeFile(wb, "تقرير_المشتريات.xlsx");
    toast.success("تم تصدير Excel — ورقة Invoices وورقة Items");
  };

  const exportPdf = () => {
    if (!hasData()) return;
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("امنع حظر النوافذ المنبثقة لتصدير PDF");
      return;
    }
    const invFooter = `<tr><th colspan="4">الإجمالي</th><th>${nf.format(totals.subtotal)}</th><th>${nf.format(totals.tax)}</th><th>${nf.format(totals.total)}</th><th></th></tr>`;
    win.document.write(`<html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
      <title>تقرير المشتريات</title>
      <style>body{font-family:system-ui,sans-serif;padding:16px}table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:20px}th,td{border:1px solid #ccc;padding:4px;text-align:right}h1{font-size:18px}h2{font-size:14px;margin:12px 0 6px}</style>
      </head><body><h1>تقرير المشتريات</h1>
      <p>${parsed.length} فاتورة · ${totals.items} بندًا · الصافي ${nf.format(totals.subtotal)} · KDV ${nf.format(totals.tax)} · الإجمالي ${nf.format(totals.total)}</p>
      <h2>الفواتير</h2>
      ${tableHtml(INVOICES_HEAD, buildInvoiceRows(), invFooter)}
      <h2>البنود</h2>
      ${tableHtml(ITEMS_HEAD, buildItemRows())}
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const reviewJob = jobs.find((j) => j.id === reviewId) ?? null;

  const saveReview = (id: string, next: ExtractedInvoice) => {
    patch(id, { data: next, status: "done" });
    setReviewId(null);
    toast.success("تم حفظ المراجعة");
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
            عدد غير محدود من الفواتير
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
                    صور أو PDF — دفعة بعد دفعة، بلا حدّ أقصى
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
                        {job.status === "processing" && "Processing · معالجة OCR…"}
                        {job.status === "done" &&
                          `Completed · ${job.data?.items.length ?? 0} بنود`}
                        {job.status === "review" && "Needs Review · تحتاج مراجعة يدوية"}
                        {job.status === "rejected" && "Rejected · ليست فاتورة واضحة"}
                        {job.status === "error" && `Rejected · ${job.error ?? ""}`}
                      </div>
                    </div>
                    {(job.status === "review" || job.status === "rejected") && job.data && (
                      <button
                        type="button"
                        onClick={() => setReviewId(job.id)}
                        className="shrink-0 rounded-lg bg-amber/20 px-2 py-1 text-[10px] font-bold"
                      >
                        مراجعة
                      </button>
                    )}

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
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-semibold text-brand">(ب) البيانات المستخرجة</div>
            {reviewJobs.length > 0 && (
              <button
                type="button"
                onClick={() => setReviewId(reviewJobs[0]!.id)}
                className="rounded-full bg-amber/25 px-2.5 py-1 text-[10px] font-bold"
              >
                {reviewJobs.length} تحتاج مراجعة يدوية
              </button>
            )}
          </div>

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
              rows.map((job, i) => {
                const inv = job.data!;
                return (
                  <div
                    key={`${job.id}-${i}`}
                    className="animate-rise grid grid-cols-[1fr_auto] items-center gap-2 border-b border-border px-3 py-2.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold">
                          {dash(inv.supplier)}
                        </span>
                        {job.status === "review" && (
                          <button
                            type="button"
                            onClick={() => setReviewId(job.id)}
                            className="shrink-0 rounded-full bg-amber/20 px-2 py-0.5 text-[9px] font-bold text-foreground"
                          >
                            مراجعة يدوية
                          </button>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {inv.date || "بدون تاريخ"} · {inv.items.length} بنود
                        {inv.invoiceNumber ? ` · #${inv.invoiceNumber}` : ""}
                        {inv.handwritten ? " · خط يد" : ""}
                      </div>
                    </div>
                    <div className="text-[13px] font-bold tabular-nums">
                      {nf.format(inv.total)}{" "}
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {currencySymbol(inv.currency)}
                      </span>
                    </div>
                  </div>
                );
              })
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
                <span className="text-[15px] font-bold opacity-80">
                  {" "}
                  {currencySymbol(totals.currency) || "عملة غير محددة"}
                </span>

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
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-xl bg-brand px-3 py-2.5 text-[12px] font-bold text-primary-foreground transition-colors active:bg-brand/90"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={exportExcel}
              className="rounded-xl bg-ink px-3 py-2.5 text-[12px] font-bold text-ink-foreground transition-opacity active:opacity-80"
            >
              Excel
            </button>
            <button
              type="button"
              onClick={exportPdf}
              className="rounded-xl bg-brand-soft px-3 py-2.5 text-[12px] font-bold text-foreground transition-opacity active:opacity-80"
            >
              PDF
            </button>
          </div>

        </div>
      </div>

      {reviewJob?.data && (
        <ReviewDialog
          job={reviewJob}
          onClose={() => setReviewId(null)}
          onSave={(next) => saveReview(reviewJob.id, next)}
        />
      )}
    </div>

  );
}

function ReviewDialog({
  job,
  onClose,
  onSave,
}: {
  job: Job;
  onClose: () => void;
  onSave: (next: ExtractedInvoice) => void;
}) {
  const [draft, setDraft] = useState<ExtractedInvoice>(job.data!);

  const set = <K extends keyof ExtractedInvoice>(k: K, v: ExtractedInvoice[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const setItem = (i: number, patchItem: Partial<InvoiceItem>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((it, idx) => (idx === i ? { ...it, ...patchItem } : it)),
    }));

  const low = (v: number) => v > 0 && v < 0.6;

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    confidence?: number,
  ) => (
    <label className="block">
      <span className="text-[10px] text-muted-foreground">
        {label}
        {confidence !== undefined && low(confidence) && (
          <span className="mr-1 rounded bg-amber/25 px-1 font-bold">ثقة منخفضة</span>
        )}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[12px]"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-background p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[14px] font-extrabold">مراجعة يدوية</div>
            <div className="truncate text-[10px] text-muted-foreground">{job.fileName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface px-2.5 py-1.5 text-[12px] font-bold"
          >
            إغلاق
          </button>
        </div>

        {job.previewUrl && (
          <img
            src={job.previewUrl}
            alt={`صورة الفاتورة ${job.fileName}`}
            className="mb-3 max-h-64 w-full rounded-xl object-contain ring-1 ring-black/5"
          />
        )}

        {draft.warnings.length > 0 && (
          <ul className="mb-3 space-y-1 rounded-xl bg-amber/15 p-2.5 text-[11px]">
            {draft.warnings.map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          {field("المورد", draft.supplier ?? "", (v) => set("supplier", v || null), draft.confidence.supplier)}
          {field(
            "رقم الفاتورة",
            draft.invoiceNumber ?? "",
            (v) => set("invoiceNumber", v || null),
            draft.confidence.invoiceNumber,
          )}
          {field("التاريخ", draft.date ?? "", (v) => set("date", v || null), draft.confidence.date)}
          {field("العملة", draft.currency ?? "", (v) => set("currency", v || null))}
          {field(
            "الصافي",
            String(draft.subtotal),
            (v) => set("subtotal", Number(v) || 0),
            draft.confidence.subtotal,
          )}
          {field("الخصم", String(draft.discount), (v) => set("discount", Number(v) || 0))}
          {field(
            "الضريبة KDV",
            String(draft.tax),
            (v) => set("tax", Number(v) || 0),
            draft.confidence.tax,
          )}
          {field(
            "الإجمالي",
            String(draft.total),
            (v) => set("total", Number(v) || 0),
            draft.confidence.total,
          )}
        </div>

        <div className="mt-4 text-[11px] font-semibold text-muted-foreground">البنود</div>
        <div className="mt-1.5 space-y-2">
          {draft.items.map((it, i) => (
            <div key={i} className="grid grid-cols-4 gap-1.5 rounded-xl bg-surface p-2">
              <input
                value={it.name}
                onChange={(e) => setItem(i, { name: e.target.value })}
                className="col-span-4 rounded-lg border border-border bg-background px-2 py-1.5 text-[12px]"
                placeholder="المنتج"
              />
              <input
                value={String(it.qty)}
                onChange={(e) => setItem(i, { qty: Number(e.target.value) || 0 })}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-[12px]"
                placeholder="الكمية"
              />
              <input
                value={String(it.unitPrice)}
                onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) || 0 })}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-[12px]"
                placeholder="السعر"
              />
              <input
                value={String(it.discount)}
                onChange={(e) => setItem(i, { discount: Number(e.target.value) || 0 })}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-[12px]"
                placeholder="الخصم"
              />
              <input
                value={String(it.total)}
                onChange={(e) => setItem(i, { total: Number(e.target.value) || 0 })}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-[12px]"
                placeholder="الإجمالي"
              />
            </div>
          ))}
          {draft.items.length === 0 && (
            <div className="rounded-xl bg-surface p-3 text-center text-[11px] text-muted-foreground">
              لا توجد بنود مقروءة
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() =>
            onSave({ ...draft, status: "completed", needsReview: false, warnings: [], isInvoice: true })
          }
          className="mt-4 w-full rounded-xl bg-brand py-3 text-[13px] font-bold text-primary-foreground"
        >
          حفظ ومتابعة
        </button>
      </div>
    </div>
  );
}

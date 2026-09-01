import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  extractInvoice,
  parseQuotaError,
  type ExtractedInvoice,
  type InvoiceItem,
} from "@/lib/invoices.functions";
import { getUsageState, type UsageState } from "@/lib/usage.functions";
import { trackActivity } from "@/lib/activity.functions";
import { amIAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "لوحة التحكم — دفتر" },
      {
        name: "description",
        content:
          "ارفع فواتير مشترياتك ويقوم دفتر بقراءتها بالـAI/OCR واستخراج الموردين والمنتجات والأسعار وحساب المجموع والضريبة في تقرير جاهز للتصدير.",
      },
      { property: "og:title", content: "دفتر — قراءة فواتير المشتريات بالذكاء الاصطناعي" },
      {
        property: "og:description",
        content: "ارفع فواتيرك واحصل على سِجِلّ منظّم وتقرير بالمجاميع والضرائب.",
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
  mimeType?: string;
  createdAt?: string;
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

const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${AR_MONTHS[Number(m) - 1] ?? m} ${y}`;
}

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
  const usageFn = useServerFn(getUsageState);
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [page, setPage] = useState(0);
  const [running, setRunning] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isPro = usage?.kind === "pro";

  const patch = useCallback((id: string, next: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...next } : j)));
  }, []);

  // جلسة المستخدم (اختيارية — الزائر يستطيع التجربة بدون حساب)
  const trackFn = useServerFn(trackActivity);
  const amIAdminFn = useServerFn(amIAdmin);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let alive = true;
    void amIAdminFn()
      .then((ok) => alive && setIsAdmin(ok))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user, amIAdminFn]);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setUser(data.user ? { id: data.user.id, email: data.user.email ?? null } : null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshUsage = useCallback(async () => {
    try {
      setUsage(await usageFn({}));
    } catch {
      /* تجاهل — لا يعطّل الواجهة */
    }
  }, [usageFn]);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage, user]);

  // سجل الفواتير المحفوظ — ميزة Pro فقط (محميّ بقواعد RLS)
  useEffect(() => {
    if (!isPro) return;
    let alive = true;
    void (async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, file_name, status, data, created_at")
        .order("created_at", { ascending: false });
      if (error || !alive || !data) return;
      const saved: Job[] = data.map((row) => ({
        id: row.id,
        fileName: row.file_name,
        status: (row.status as Status) ?? "done",
        progress: 100,
        createdAt: row.created_at,
        data: row.data as unknown as ExtractedInvoice,
      }));
      setJobs((prev) => {
        const known = new Set(prev.map((j) => j.id));
        return [...prev, ...saved.filter((s) => !known.has(s.id))];
      });
    })();
    return () => {
      alive = false;
    };
  }, [isPro]);

  // الحفظ الدائم متاح لمستخدمي Pro فقط — لا تُحفظ ملفات الزائر أو Free
  const persist = useCallback(
    async (fileName: string, status: Status, inv: ExtractedInvoice) => {
      if (!user || !isPro) return;
      const { error } = await supabase.from("invoices").insert({
        user_id: user.id,
        file_name: fileName,
        status,
        supplier: inv.supplier,
        invoice_number: inv.invoiceNumber,
        invoice_date: inv.date,
        currency: inv.currency,
        subtotal: inv.subtotal,
        discount: inv.discount,
        tax: inv.tax,
        total: inv.total,
        data: inv as unknown as never,
      });
      if (error) console.error(error);
    },
    [user, isPro],
  );

  // حذف ملف من قائمة المعالجة — بدون إعادة الرصيد المستهلك
  // وإن كانت الفاتورة محفوظة في قاعدة البيانات (Pro) تُحذف منها أيضًا حتى لا تعود بعد التحديث
  const removeJob = useCallback(
    (id: string) => {
      setJobs((prev) => {
        const target = prev.find((j) => j.id === id);
        if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
        return prev.filter((j) => j.id !== id);
      });
      setReviewId((cur) => (cur === id ? null : cur));
      if (user && isPro) {
        void supabase
          .from("invoices")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id)
          .then(({ error }) => {
            if (error) console.error(error);
          });
      }
    },
    [user, isPro],
  );

  const signOut = useCallback(async () => {

    void trackFn({ data: { action: "logout" } }).catch(() => undefined);
    await supabase.auth.signOut();
    setJobs([]);
    void navigate({ to: "/", replace: true });
  }, [navigate, trackFn]);


  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      let files = Array.from(fileList);
      void trackFn({ data: { action: "file_upload", count: files.length } }).catch(() => undefined);

      const remaining = usage ? Math.max(0, usage.limit - usage.used) : files.length;
      if (usage && remaining === 0) {
        setUpgradeOpen(true);
        return;
      }
      if (usage && files.length > remaining) {
        files = files.slice(0, remaining);
        toast.error(`رصيدك يسمح بمعالجة ${remaining} فاتورة فقط الآن`);
      }

      const newJobs: Job[] = files.map((f, i) => ({
        id: `${Date.now()}-${i}-${f.name}`,
        fileName: f.name,
        status: "queued",
        progress: 0,
        mimeType: f.type,
        previewUrl: URL.createObjectURL(f),
      }));
      setJobs((prev) => [...newJobs, ...prev]);
      setRunning(true);

      let quotaHit = false;
      let cursor = 0;
      const worker = async () => {
        while (cursor < files.length) {
          const index = cursor++;
          if (quotaHit) {
            patch(newJobs[index]!.id, {
              status: "error",
              progress: 100,
              error: "انتهى الرصيد المجاني",
            });
            continue;
          }
          const file = files[index]!;
          const job = newJobs[index]!;
          patch(job.id, { status: "processing", progress: 25 });
          try {
            const dataUrl = await readAsDataUrl(file);
            patch(job.id, { progress: 60 });

            const data = await extract({
              data: { fileName: file.name, mimeType: file.type, dataUrl },
            });
            const nextStatus: Status =
              data.status === "completed"
                ? "done"
                : data.status === "rejected"
                  ? "rejected"
                  : "review";
            patch(job.id, { status: nextStatus, progress: 100, data });
            void persist(file.name, nextStatus, data);
          } catch (err) {
            const message = err instanceof Error ? err.message : "خطأ غير معروف";
            const quota = parseQuotaError(message);
            if (quota) {
              quotaHit = true;
              setUpgradeOpen(true);
              patch(job.id, {
                status: "error",
                progress: 100,
                error: "انتهى رصيدك — قم بالترقية",
              });
            } else {
              // فشل فاتورة واحدة لا يوقف البقية (ولا يُخصم رصيد)
              patch(job.id, { status: "error", progress: 100, error: message });
            }
          }
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      setRunning(false);
      void refreshUsage();
      if (!quotaHit) toast.success("انتهت معالجة الدفعة");
    },
    [extract, patch, persist, usage, refreshUsage],
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
    void trackFn({ data: { action: "csv_export" } }).catch(() => undefined);
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
    void trackFn({ data: { action: "excel_export" } }).catch(() => undefined);
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
    void trackFn({ data: { action: "pdf_export" } }).catch(() => undefined);
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
    if (isPro) {
      void supabase
        .from("invoices")
        .update({
          status: "done",
          supplier: next.supplier,
          invoice_number: next.invoiceNumber,
          invoice_date: next.date,
          currency: next.currency,
          subtotal: next.subtotal,
          discount: next.discount,
          tax: next.tax,
          total: next.total,
          data: next as unknown as never,
        })
        .eq("id", id);
    }
  };

  // تجميع الفواتير المحفوظة حسب الشهر (Pro)
  const monthlyGroups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; jobs: Job[]; count: number; total: number; tax: number }
    >();
    for (const j of jobs) {
      if (!j.data) continue;
      const d = new Date(j.createdAt ?? Date.now());
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const g = map.get(key) ?? { key, jobs: [], count: 0, total: 0, tax: 0 };
      g.jobs.push(j);
      g.count += 1;
      g.total += j.data.total ?? 0;
      g.tax += j.data.tax ?? 0;
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [jobs]);




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
          <div className="flex items-center gap-2">
            {usage && (
              <span className="rounded-full bg-brand-soft/60 px-2.5 py-1 text-[10px] font-bold">
                {usage.kind === "guest" && `التجربة المجانية: ${usage.used} / ${usage.limit}`}
                {usage.kind === "free" &&
                  `المتبقي هذا الشهر: ${Math.max(0, usage.limit - usage.used)} / ${usage.limit}`}
                {usage.kind === "pro" && `المستخدمة: ${usage.used} / ${usage.limit}`}
              </span>
            )}
            {usage && usage.kind !== "pro" ? (
              <Link
                to="/pricing"
                className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold text-primary-foreground"
              >
                الترقية إلى Pro
              </Link>
            ) : (
              usage && (
                <Link
                  to="/pricing"
                  className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold text-ink-foreground"
                >
                  إدارة الاشتراك
                </Link>
              )
            )}
            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="max-w-[130px] truncate rounded-full bg-surface px-3 py-1 text-[11px] font-semibold ring-1 ring-black/5"
                  dir="ltr"
                >
                  {user.email}
                </button>
                {menuOpen && (
                  <div className="absolute left-0 z-30 mt-2 w-44 overflow-hidden rounded-xl bg-surface text-right shadow-lg ring-1 ring-black/10">
                    <div className="border-b border-border px-3 py-2">
                      <div className="text-[10px] text-muted-foreground">الحساب</div>
                      <div dir="ltr" className="truncate text-[11px] font-semibold">
                        {user.email}
                      </div>
                    </div>
                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="block border-b border-border px-3 py-2 text-[12px] font-bold text-brand hover:bg-brand-soft/40"
                      >
                        لوحة الإدارة
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => void signOut()}
                      className="w-full px-3 py-2 text-right text-[12px] font-bold text-foreground hover:bg-brand-soft/40"
                    >
                      تسجيل الخروج
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold text-foreground"
              >
                تسجيل الدخول
              </Link>
            )}
          </div>

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
                    <button
                      type="button"
                      aria-label={`حذف ${job.fileName}`}
                      title="حذف من القائمة (لا يُعاد الرصيد المستهلك)"
                      onClick={() => removeJob(job.id)}
                      className="shrink-0 rounded-lg px-1.5 py-1 text-[13px] font-black leading-none text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      ✕
                    </button>

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

        <section className="mt-6">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <div className="text-[11px] font-semibold text-brand">(د) فواتيري الشهرية</div>
              <h2 className="text-[18px] font-extrabold tracking-tight">الأرشيف الشهري</h2>
            </div>
            {!isPro && (
              <Link to="/pricing" className="text-[11px] font-bold text-brand">
                فعّل بالترقية
              </Link>
            )}
          </div>

          {!isPro ? (
            <div className="rounded-2xl bg-surface p-4 text-center ring-1 ring-black/5">
              <div className="text-[13px] font-extrabold">🔒 الأرشيف متاح لمشتركي Pro</div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                في خطة Pro تُحفظ كل فواتيرك في حسابك مرتبة حسب الشهر، ويمكنك الرجوع إليها
                وتصديرها في أي وقت. في الخطة المجانية تُحلَّل الفواتير ثم تُحذف بعد إغلاق الصفحة.
              </p>
              <Link
                to="/pricing"
                className="mt-3 inline-block rounded-xl bg-brand px-4 py-2.5 text-[13px] font-extrabold text-primary-foreground"
              >
                الترقية إلى Pro
              </Link>
            </div>
          ) : monthlyGroups.length === 0 ? (
            <div className="rounded-2xl bg-surface p-4 text-center text-[12px] text-muted-foreground ring-1 ring-black/5">
              لا توجد فواتير محفوظة بعد — ارفع أول فاتورة وستظهر هنا.
            </div>
          ) : (
            <div className="space-y-2">
              {monthlyGroups.map((group) => (
                <div
                  key={group.key}
                  className="overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5"
                >
                  <button
                    type="button"
                    onClick={() => setOpenMonth(openMonth === group.key ? null : group.key)}
                    className="flex w-full items-center justify-between gap-2 p-3 text-right"
                  >
                    <div>
                      <div className="text-[13px] font-extrabold">{monthLabel(group.key)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {group.count} فاتورة · ضريبة {nf.format(group.tax)}
                      </div>
                    </div>
                    <div className="text-[14px] font-extrabold text-brand tabular-nums">
                      {nf.format(group.total)}
                    </div>
                  </button>
                  {openMonth === group.key && (
                    <div className="border-t border-border">
                      {group.jobs.map((j) => (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => setReviewId(j.id)}
                          className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-right last:border-0"
                        >
                          <span className="min-w-0 flex-1 truncate text-[12px]">
                            {dash(j.data?.supplier)}{" "}
                            <span className="text-muted-foreground">
                              · {dash(j.data?.invoiceNumber)}
                            </span>
                          </span>
                          <span className="text-[12px] font-bold tabular-nums">
                            {nf.format(j.data?.total ?? 0)}
                            <span className="mr-1 text-[10px] text-muted-foreground">
                              {currencySymbol(j.data?.currency ?? null)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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

      {upgradeOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-background p-5 text-center sm:rounded-2xl">
            <div className="text-[18px] font-extrabold">انتهى رصيدك المجاني</div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {usage?.kind === "guest"
                ? "لقد استخدمت الفاتورتين المجانيتين. أنشئ حسابًا مجانيًا للحصول على 5 فواتير شهريًا، أو ارتقِ إلى Pro لتحليل 1000 فاتورة شهريًا مع حفظ وأرشفة."
                : "لقد استخدمت فواتيرك المجانية لهذا الشهر. ارتقِ إلى Pro لتحليل 1000 فاتورة شهريًا مع حفظ الفواتير وأرشفتها."}
            </p>
            <div className="mt-4 grid gap-2">
              <Link
                to="/pricing"
                className="rounded-xl bg-brand py-3 text-[14px] font-extrabold text-primary-foreground"
              >
                الترقية إلى Pro — $25/شهر
              </Link>
              {usage?.kind === "guest" && (
                <Link
                  to="/signup"
                  className="rounded-xl border border-border py-3 text-[13px] font-extrabold"
                >
                  إنشاء حساب مجاني (5 فواتير شهريًا)
                </Link>
              )}
              <button
                type="button"
                onClick={() => setUpgradeOpen(false)}
                className="py-2 text-[12px] font-bold text-muted-foreground"
              >
                لاحقًا
              </button>
            </div>
          </div>
        </div>
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

        {job.previewUrl &&
          (job.mimeType === "application/pdf" ? (
            <iframe
              src={job.previewUrl}
              title={`معاينة الفاتورة ${job.fileName}`}
              className="mb-3 h-64 w-full rounded-xl ring-1 ring-black/5"
            />
          ) : (
            <img
              src={job.previewUrl}
              alt={`صورة الفاتورة ${job.fileName}`}
              className="mb-3 max-h-64 w-full rounded-xl object-contain ring-1 ring-black/5"
            />
          ))}


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

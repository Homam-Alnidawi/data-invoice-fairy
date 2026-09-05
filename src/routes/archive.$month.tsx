import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { monthLabel, useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/archive/$month")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الأرشيف الشهري — دفتر" },
      {
        name: "description",
        content: "تفاصيل فواتير الشهر: الموردون، إجمالي المشتريات، والضريبة.",
      },
      { property: "og:title", content: "الأرشيف الشهري — دفتر" },
      {
        property: "og:description",
        content: "تفاصيل فواتير الشهر: الموردون، إجمالي المشتريات، والضريبة.",
      },
    ],
  }),
  component: ArchiveMonthPage,
});

const nf = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});


function currencySymbol(code: string | null) {
  if (!code) return "";
  const c = code.toUpperCase();
  if (c === "TRY" || c === "TL") return "₺";
  if (c === "SAR") return "ر.س";
  if (c === "USD") return "$";
  if (c === "EUR") return "€";
  return code;
}

type Row = {
  id: string;
  file_name: string;
  supplier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  created_at: string;
  data?: { items?: { name: string; qty: number; unitPrice: number; discount: number; total: number }[] } | null;
};

type SupplierGroup = {
  supplier: string;
  currency: string | null;
  count: number;
  total: number;
  tax: number;
  invoices: Row[];
};

function ArchiveMonthPage() {
  const { month } = Route.useParams();
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noAuth, setNoAuth] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        if (alive) setNoAuth(true);
        return;
      }
      const { data, error: err } = await supabase
        .from("invoices")
        .select(
          "id, file_name, supplier, invoice_number, invoice_date, currency, subtotal, discount, tax, total, created_at, data",
        )
        .eq("archive_month", month)
        .order("created_at", { ascending: false });
      if (!alive) return;
      if (err) setError(t("arc.loadError"));
      else setRows((data as unknown as Row[]) ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [month]);

  const groups = useMemo<SupplierGroup[]>(() => {
    const map = new Map<string, SupplierGroup>();
    for (const r of rows ?? []) {
      const key = r.supplier?.trim() || t("dash.unknown");
      const g =
        map.get(key) ?? {
          supplier: key,
          currency: r.currency,
          count: 0,
          total: 0,
          tax: 0,
          invoices: [],
        };
      g.count += 1;
      g.total += Number(r.total) || 0;
      g.tax += Number(r.tax) || 0;
      g.invoices.push(r);
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const totals = useMemo(() => {
    return (rows ?? []).reduce(
      (acc, r) => {
        acc.total += Number(r.total) || 0;
        acc.tax += Number(r.tax) || 0;
        return acc;
      },
      { total: 0, tax: 0 },
    );
  }, [rows]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error: err } = await supabase.from("invoices").delete().eq("id", deleteTarget.id);
    if (err) {
      setError(t("arc.deleteError"));
    } else {
      setRows((prev) => (prev ?? []).filter((r) => r.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  };

  const INV_HEAD = [
    t("col.invNumber"),
    t("col.date"),
    t("dash.supplier"),
    t("col.currency"),
    t("col.net"),
    t("col.tax"),
    t("col.total"),
  ];
  const ITEM_HEAD = [
    t("col.invNumber"),
    t("dash.supplier"),
    t("col.product"),
    t("col.qty"),
    t("col.unitPrice"),
    t("col.discount"),
    t("col.lineTotal"),
  ];

  const invRows = () =>
    (rows ?? []).map((r) => [
      r.invoice_number?.trim() || r.file_name,
      r.invoice_date?.trim() || "—",
      r.supplier?.trim() || t("dash.unknown"),
      r.currency ?? "—",
      String(r.subtotal ?? 0),
      String(r.tax ?? 0),
      String(r.total ?? 0),
    ]);

  const itemRows = () => {
    const out: string[][] = [];
    for (const r of rows ?? []) {
      for (const it of r.data?.items ?? []) {
        out.push([
          r.invoice_number?.trim() || r.file_name,
          r.supplier?.trim() || t("dash.unknown"),
          it.name,
          String(it.qty ?? 0),
          String(it.unitPrice ?? 0),
          String(it.discount ?? 0),
          String(it.total ?? 0),
        ]);
      }
    }
    return out;
  };

  const exportExcel = async () => {
    if (!rows || rows.length === 0) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const wsInv = XLSX.utils.aoa_to_sheet([INV_HEAD, ...invRows()]);
      wsInv["!cols"] = INV_HEAD.map(() => ({ wch: 18 }));
      XLSX.utils.book_append_sheet(wb, wsInv, "Invoices");
      const wsItems = XLSX.utils.aoa_to_sheet([ITEM_HEAD, ...itemRows()]);
      wsItems["!cols"] = ITEM_HEAD.map(() => ({ wch: 18 }));
      XLSX.utils.book_append_sheet(wb, wsItems, "Items");
      XLSX.writeFile(wb, `archive-${month}.xlsx`);
      toast.success(t("arc.exportDone"));
    } catch {
      toast.error(t("arc.exportFail"));
    }
  };

  const exportPdf = async () => {
    if (!rows || rows.length === 0) return;
    const esc = (c: string) => c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const table = (head: string[], data: string[][]) =>
      `<table border="1" cellspacing="0" cellpadding="4" dir="${lang === "ar" ? "rtl" : "ltr"}">
        <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${data.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>`;
    const holder = document.createElement("div");
    holder.style.cssText = `position:fixed;left:-12000px;top:0;width:1120px;padding:32px;background:#fff;color:#000;text-align:${lang === "ar" ? "right" : "left"};`;
    holder.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    holder.innerHTML = `<h1>${esc(t("arc.title", { month: monthLabel(lang, month) }))}</h1>
      <p>${esc(t("arc.summary", { n: rows.length, m: groups.length }))} · ${esc(t("arc.totalPurchases"))}: ${nf.format(totals.total)} · ${esc(t("arc.totalTax"))}: ${nf.format(totals.tax)}</p>
      ${table(INV_HEAD, invRows())}
      <h2>${esc(t("col.product"))}</h2>
      ${table(ITEM_HEAD, itemRows())}`;
    document.body.appendChild(holder);
    const toastId = toast.loading(t("arc.exportPreparing"));
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(holder, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      let y = 0;
      pdf.addImage(imgData, "JPEG", 0, y, pageW, imgH);
      let remaining = imgH - pageH;
      while (remaining > 0) {
        y -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, y, pageW, imgH);
        remaining -= pageH;
      }
      pdf.save(`archive-${month}.pdf`);
      toast.success(t("arc.exportDone"), { id: toastId });
    } catch {
      toast.error(t("arc.exportFail"), { id: toastId });
    } finally {
      holder.remove();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <BrandMark />
            <div className="leading-none">
              <div className="text-[15px] font-extrabold tracking-tight">{t("arc.title",{month:monthLabel(lang,month)})}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{t("arc.sub")}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
          {rows && rows.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => void exportExcel()}
                className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-ink-foreground"
              >
                {t("arc.exportExcel")}
              </button>
              <button
                type="button"
                onClick={() => void exportPdf()}
                className="rounded-full bg-brand-soft px-3 py-1.5 text-[11px] font-bold text-foreground"
              >
                {t("arc.exportPdf")}
              </button>
            </>
          )}
          <Link
            to="/dashboard"
            className="rounded-full bg-surface px-3 py-1.5 text-[11px] font-bold ring-1 ring-black/5 transition-colors hover:bg-brand-soft/60"
          >
            ← {t("arc.back")}
          </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        {noAuth ? (
          <div className="rounded-2xl bg-surface p-5 text-center ring-1 ring-black/5">
            <div className="text-[14px] font-extrabold">{t("arc.loginToView")}</div>
            <Link
              to="/login"
              className="mt-3 inline-block rounded-xl bg-brand px-4 py-2.5 text-[13px] font-extrabold text-primary-foreground"
            >
              {t("nav.login")}
            </Link>
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-surface p-5 text-center text-[13px] font-bold text-destructive ring-1 ring-black/5">
            {error}
          </div>
        ) : rows === null ? (
          <div className="rounded-2xl bg-surface p-5 text-center text-[12px] text-muted-foreground ring-1 ring-black/5">
            {t("arc.loading")}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-surface p-5 text-center text-[12px] text-muted-foreground ring-1 ring-black/5">
            {t("arc.empty",{month:monthLabel(lang,month)})}
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-surface p-3 text-center ring-1 ring-black/5">
                <div className="text-[10px] text-muted-foreground">{t("arc.count")}</div>
                <div className="mt-1 text-[16px] font-extrabold tabular-nums">{rows.length}</div>
              </div>
              <div className="rounded-2xl bg-surface p-3 text-center ring-1 ring-black/5">
                <div className="text-[10px] text-muted-foreground">{t("arc.totalPurchases")}</div>
                <div className="mt-1 text-[16px] font-extrabold text-brand tabular-nums">
                  {nf.format(totals.total)}
                </div>
              </div>
              <div className="rounded-2xl bg-surface p-3 text-center ring-1 ring-black/5">
                <div className="text-[10px] text-muted-foreground">{t("arc.totalTax")}</div>
                <div className="mt-1 text-[16px] font-extrabold tabular-nums">
                  {nf.format(totals.tax)}
                </div>
              </div>
            </div>

            <div className="mb-2 text-[11px] font-semibold text-brand">
              {t("arc.summary",{n:rows.length,m:groups.length})}
            </div>

            <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5">
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-border px-3 py-2 text-[10px] font-semibold text-muted-foreground">
                <div className="text-start">{t("dash.supplier")}</div>
                <div className="text-center">{t("col.date")}</div>
                <div className="text-end">{t("col.total")}</div>
                <div className="w-8"></div>
              </div>
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-border px-3 py-2.5 text-right last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-bold">
                      {r.supplier?.trim() || t("dash.unknown")}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {r.invoice_number?.trim() || r.file_name}
                    </div>
                  </div>
                  <div dir="ltr" className="text-left text-[11px] tabular-nums text-muted-foreground">
                    {r.invoice_date?.trim() || "—"}
                  </div>
                  <div dir="ltr" className="text-left text-[13px] font-extrabold text-brand tabular-nums">
                    {nf.format(Number(r.total) || 0)}
                    <span className="mr-1 text-[10px] font-semibold text-muted-foreground">
                      {currencySymbol(r.currency)}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={t("arc.deleteHint")}
                    title={t("arc.deleteHint")}
                    onClick={() => setDeleteTarget(r)}
                    className="grid w-8 place-items-center rounded-lg py-1 text-[13px] font-black leading-none text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-5 text-center text-[10px] text-muted-foreground">
          {t("arc.footer")}
        </p>
      </main>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("arc.delTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("arc.delBody",{name:deleteTarget?.file_name ?? ""})}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>{t("arc.delCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("arc.delConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

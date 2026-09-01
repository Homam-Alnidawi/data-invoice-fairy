import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  dataUrl: z.string(),
});

export class QuotaError extends Error {
  kind: "guest" | "free" | "pro";
  used: number;
  limit: number;
  constructor(kind: "guest" | "free" | "pro", used: number, limit: number) {
    super(`QUOTA_EXCEEDED:${kind}:${used}:${limit}`);
    this.kind = kind;
    this.used = used;
    this.limit = limit;
  }
}

export function parseQuotaError(message: string) {
  const m = message.match(/QUOTA_EXCEEDED:(guest|free|pro):(\d+):(\d+)/);
  if (!m) return null;
  return { kind: m[1] as "guest" | "free" | "pro", used: Number(m[2]), limit: Number(m[3]) };
}


export type InvoiceItem = {
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  total: number;
};

export type Confidence = {
  supplier: number;
  invoiceNumber: number;
  date: number;
  items: number;
  subtotal: number;
  tax: number;
  total: number;
};

export type InvoiceStatus = "completed" | "review" | "rejected";

export type ExtractedInvoice = {
  supplier: string | null;
  invoiceNumber: string | null;
  date: string | null;
  currency: string | null;
  handwritten: boolean;
  isInvoice: boolean;
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
  items: InvoiceItem[];
  confidence: Confidence;
  warnings: string[];
  status: InvoiceStatus;
  needsReview: boolean;
};

const SYSTEM = `أنت محلل فواتير مشتريات خبير في قراءة النصوص المطبوعة والمكتوبة بخط اليد (OCR + Handwriting).

المهمة:
1) حدّد أولًا هل الملف فاتورة شراء فعلية (is_invoice).
2) إن كانت فاتورة، استخرج الحقول سواء كانت مطبوعة أو مكتوبة بخط اليد.
3) لا تخترع أي قيمة إطلاقًا. أي حقل غير واضح أو غير موجود = null (وليس صفرًا ولا تخمينًا).
4) لا تفترض عملة افتراضية. استخرج العملة كما وردت (TRY, SAR, USD, EUR...). إذا لم تظهر، اجعلها null.
5) أعطِ لكل حقل درجة ثقة بين 0 و1 تعكس وضوح القراءة (خط اليد غير الواضح = ثقة منخفضة).

أعد JSON فقط دون أي نص إضافي بهذا الشكل:
{
 "is_invoice": true,
 "handwritten": false,
 "supplier": null,
 "invoice_number": null,
 "date": null,
 "currency": null,
 "subtotal": null,
 "discount": null,
 "tax_rate": null,
 "tax": null,
 "total": null,
 "items": [{"name": null, "qty": null, "unit_price": null, "discount": null, "total": null}],
 "confidence": {"supplier":0,"invoice_number":0,"date":0,"items":0,"subtotal":0,"tax":0,"total":0},
 "notes": ""
}
التاريخ بصيغة YYYY-MM-DD إن أمكن. الأرقام أرقام وليست نصوصًا. tax_rate نسبة عشرية (0.15 = 15%، 0.20 = 20%).`;

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function conf(v: unknown): number {
  const n = numOrNull(v);
  if (n === null) return 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

function strOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || s.toLowerCase() === "null" || s === "غير معروف") return null;
  return s;
}

const LOW = 0.6;
const EPS = 0.05; // هامش خطأ نسبي بسيط

export const extractInvoice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<ExtractedInvoice> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("مفتاح الذكاء الاصطناعي غير مهيأ");

    // التحقق من الخطة والرصيد على الخادم قبل أي معالجة
    const { consumeQuota } = await import("./usage.server");
    const ticket = await consumeQuota();
    if (!ticket.allowed) {
      throw new QuotaError(ticket.kind, ticket.used, ticket.limit);
    }
    const refund = ticket.refund;
    const fail = async (err: unknown) => {
      await refund().catch(() => undefined);
      throw err;
    };


    const isPdf =
      data.mimeType === "application/pdf" || data.dataUrl.startsWith("data:application/pdf");

    const mediaBlock = isPdf
      ? {
          type: "file" as const,
          file: { filename: data.fileName, file_data: data.dataUrl },
        }
      : { type: "image_url" as const, image_url: { url: data.dataUrl } };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `اقرأ هذه الفاتورة بعناية (قد تحتوي كتابة يدوية): ${data.fileName}`,
              },
              mediaBlock,
            ],
          },
        ],
      }),
    }).catch(async (e: unknown) => {
      await fail(new Error("تعذّر الاتصال بخدمة الذكاء الاصطناعي"));
      throw e;
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) await fail(new Error("تم تجاوز حد الطلبات، حاول بعد قليل"));
      if (res.status === 402) await fail(new Error("رصيد الذكاء الاصطناعي غير كافٍ"));
      await fail(new Error(`تعذّرت قراءة الفاتورة (${res.status}) ${body.slice(0, 160)}`));
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) await fail(new Error("لم نتمكن من تفسير محتوى الفاتورة"));

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(match![0]) as Record<string, unknown>;
    } catch {
      await fail(new Error("لم نتمكن من تفسير محتوى الفاتورة"));
      raw = {};
    }


    const c = (raw["confidence"] ?? {}) as Record<string, unknown>;
    const confidence: Confidence = {
      supplier: conf(c["supplier"]),
      invoiceNumber: conf(c["invoice_number"]),
      date: conf(c["date"]),
      items: conf(c["items"]),
      subtotal: conf(c["subtotal"]),
      tax: conf(c["tax"]),
      total: conf(c["total"]),
    };

    const items: InvoiceItem[] = Array.isArray(raw["items"])
      ? (raw["items"] as Array<Record<string, unknown>>)
          .map((it) => ({
            name: strOrNull(it["name"]) ?? "غير معروف",
            qty: numOrNull(it["qty"]) ?? 0,
            unitPrice: numOrNull(it["unit_price"] ?? it["unitPrice"]) ?? 0,
            discount: numOrNull(it["discount"]) ?? 0,
            total:
              numOrNull(it["total"]) ??
              (numOrNull(it["qty"]) ?? 0) * (numOrNull(it["unit_price"] ?? it["unitPrice"]) ?? 0),
          }))
          .filter((it) => it.name !== "غير معروف" || it.total > 0)
      : [];

    const isInvoice = raw["is_invoice"] !== false;
    const supplier = strOrNull(raw["supplier"]);
    const invoiceNumber = strOrNull(raw["invoice_number"] ?? raw["invoiceNumber"]);
    const date = strOrNull(raw["date"]);
    const currency = strOrNull(raw["currency"]);
    const handwritten = Boolean(raw["handwritten"]);

    const subtotalRaw = numOrNull(raw["subtotal"]);
    const discount = numOrNull(raw["discount"]) ?? 0;
    const taxRate = numOrNull(raw["tax_rate"] ?? raw["taxRate"]);
    const taxRaw = numOrNull(raw["tax"]);
    const totalRaw = numOrNull(raw["total"]);

    const subtotal = subtotalRaw ?? 0;
    const tax = taxRaw ?? 0;
    const total = totalRaw ?? 0;

    const warnings: string[] = [];

    if (!isInvoice) warnings.push("ليست فاتورة واضحة / تحتاج مراجعة");

    // التحقق الحسابي
    const itemsSum = items.reduce((s, it) => s + (it.total || 0), 0);
    const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));

    if (items.length > 0 && subtotalRaw !== null && rel(itemsSum, subtotal - 0) > EPS) {
      warnings.push(
        `مجموع البنود (${itemsSum.toFixed(2)}) لا يطابق الصافي (${subtotal.toFixed(2)}) — يوجد اختلاف في الحساب ويجب مراجعة الفاتورة.`,
      );
    }
    if (subtotalRaw !== null && taxRaw !== null && totalRaw !== null) {
      if (rel(subtotal + tax - discount, total) > EPS) {
        warnings.push(
          "الصافي + الضريبة لا يساوي الإجمالي — يوجد اختلاف في الحساب ويجب مراجعة الفاتورة.",
        );
      }
    }
    if (subtotalRaw === null || totalRaw === null) {
      warnings.push("قيم مالية أساسية غير مقروءة (الصافي أو الإجمالي).");
    }
    if (currency === null) warnings.push("عملة غير محددة");
    if (supplier === null) warnings.push("اسم المورد غير مقروء");
    if (invoiceNumber === null) warnings.push("رقم الفاتورة غير مقروء");
    if (date === null) warnings.push("التاريخ غير مقروء");
    if (items.length === 0) warnings.push("لم تُقرأ أي بنود");

    const lowFields = Object.entries(confidence)
      .filter(([, v]) => v > 0 && v < LOW)
      .map(([k]) => k);
    if (lowFields.length > 0) warnings.push("حقول بثقة منخفضة تحتاج تدقيقًا");

    const status: InvoiceStatus = !isInvoice
      ? "rejected"
      : warnings.length > 0
        ? "review"
        : "completed";

    return {
      supplier,
      invoiceNumber,
      date,
      currency,
      handwritten,
      isInvoice,
      subtotal,
      discount,
      taxRate: taxRate ?? 0,
      tax,
      total,
      items,
      confidence,
      warnings,
      status,
      needsReview: status !== "completed",
      _recorded: await (async () => {
        const { recordProcessed } = await import("./usage.server");
        await recordProcessed(1).catch(() => undefined);
        return true;
      })(),

    };
  });

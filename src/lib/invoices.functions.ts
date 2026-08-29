import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  dataUrl: z.string(),
});

export type InvoiceItem = {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
};

export type ExtractedInvoice = {
  supplier: string;
  invoiceNumber: string;
  date: string;
  currency: string;
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
  items: InvoiceItem[];
  needsReview: boolean;
};

const SYSTEM = `أنت محلل فواتير مشتريات. استخرج البيانات من صورة/ملف الفاتورة وأعد JSON فقط بالشكل التالي دون أي نص إضافي:
{"supplier":"","invoiceNumber":"","date":"YYYY-MM-DD","currency":"SAR","subtotal":0,"discount":0,"taxRate":0.15,"tax":0,"total":0,"items":[{"name":"","qty":1,"unitPrice":0,"total":0}],"needsReview":false}
القواعد: الأرقام أرقام لا نصوص. إذا كان حقل غير واضح اتركه فارغًا/صفرًا واجعل needsReview=true. taxRate كنسبة عشرية (0.15 تعني 15%).`;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export const extractInvoice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<ExtractedInvoice> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("مفتاح الذكاء الاصطناعي غير مهيأ");

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
              { type: "text", text: `اقرأ هذه الفاتورة: ${data.fileName}` },
              { type: "image_url", image_url: { url: data.dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("تم تجاوز حد الطلبات، حاول بعد قليل");
      if (res.status === 402) throw new Error("رصيد الذكاء الاصطناعي غير كافٍ");
      throw new Error(`تعذّرت قراءة الفاتورة (${res.status}) ${body.slice(0, 160)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("لم نتمكن من تفسير محتوى الفاتورة");

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      throw new Error("لم نتمكن من تفسير محتوى الفاتورة");
    }

    const items = Array.isArray(raw["items"])
      ? (raw["items"] as Array<Record<string, unknown>>).map((it) => ({
          name: String(it["name"] ?? "بند"),
          qty: num(it["qty"]) || 1,
          unitPrice: num(it["unitPrice"]),
          total: num(it["total"]),
        }))
      : [];

    const subtotal = num(raw["subtotal"]);
    const discount = num(raw["discount"]);
    const taxRate = num(raw["taxRate"]);
    const tax = num(raw["tax"]) || subtotal * taxRate;
    const total = num(raw["total"]) || subtotal + tax;

    return {
      supplier: String(raw["supplier"] ?? "").trim() || "مورد غير معروف",
      invoiceNumber: String(raw["invoiceNumber"] ?? "").trim(),
      date: String(raw["date"] ?? "").trim(),
      currency: String(raw["currency"] ?? "SAR").trim() || "SAR",
      subtotal,
      discount,
      taxRate: taxRate || 0.15,
      tax,
      total,
      items,
      needsReview: Boolean(raw["needsReview"]) || total === 0 || !raw["supplier"],
    };
  });

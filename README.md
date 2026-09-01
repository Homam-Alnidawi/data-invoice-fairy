# Smart Invoice Report

اريد ان افعل موقع ارفع فواتير مشترياتك، وسيقوم النظام تلقائيًا بحساب إجمالي المشتريات، الضريبة، المنتجات، الأسعار، والموردين، ثم يعطيك تقريرًا جاهزًا.

500 فاتورة

     ↓

Invoice AI

     ↓

قراءة الفواتير بالـAI/OCR

     ↓

استخراج البيانات

     ↓

تنظيمها

     ↓

حساب المجموع والضرائب

     ↓

تقرير

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://data-invoice-fairy.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d895d07d-99c6-4325-a978-1e1e9047bc61).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## التشغيل بشكل مستقل (Standalone Deployment)

المعمارية: GitHub → Vercel/Hosting → Supabase (Auth + Database + Storage) → Server Functions → مزوّد AI خارجي.

1. انسخ `.env.example` إلى `.env` واملأ القيم.
2. المفاتيح السرية (`SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY`) تُضاف كمتغيرات بيئة على الخادم فقط — لا تبدأ أبدًا بـ `VITE_`.
3. اختر مزوّد الذكاء الاصطناعي من **Admin → Settings → AI Provider** (Gemini / OpenAI / Anthropic / Custom)، ثم اضغط **Test AI Connection**.
4. لا حاجة إلى حساب Lovable بعد ضبط مزوّد خارجي؛ خيار `lovable` يبقى كخيار احتياطي فقط.
5. جميع الحدود والأسرار تُفرض داخل Server Functions المحمية بدور Admin — لا شيء منها يصل إلى المتصفح.

insert into public.plans (code, name, description, price_cents, currency, billing_interval, invoice_limit, processing_limit, features, is_active, sort_order)
values ('business', 'Business', 'اشتراك الأعمال الشهري', 5000, 'USD', 'month', 2000, 2000,
  '["تحليل الفواتير باستخدام AI","حفظ الفواتير","أرشفة الفواتير شهريًا","تصدير الفواتير والبيانات","سجل الفواتير والأرشيف","حتى 2000 فاتورة شهريًا"]'::jsonb,
  true, 3)
on conflict (code) do update set
  name = excluded.name,
  price_cents = excluded.price_cents,
  invoice_limit = excluded.invoice_limit,
  processing_limit = excluded.processing_limit,
  features = excluded.features,
  is_active = true,
  sort_order = 3;
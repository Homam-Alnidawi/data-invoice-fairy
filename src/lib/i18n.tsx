import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "ar" | "en" | "tr";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
];

export const dirOf = (_lang: Lang): "rtl" | "ltr" => "rtl";

const STORAGE_KEY = "daftar.lang";

type Dict = Record<string, string>;

const ar: Dict = {
  "brand.name": "دفتر",
  "brand.mark": "دف",
  "brand.tagline": "فواتير المشتريات الذكية",
  "nav.login": "تسجيل الدخول",
  "nav.tryFree": "جرب مجانًا",
  "nav.signup": "إنشاء حساب",
  "landing.kicker": "Invoice AI",
  "landing.title": "ارفع فواتير مشترياتك، واستلم تقريرًا محاسبيًا جاهزًا",
  "landing.subtitle":
    "دفتر يقرأ فواتيرك بالذكاء الاصطناعي، يستخرج الموردين والمنتجات والأسعار، يتحقق من الحسابات، ويحسب الضريبة والإجمالي — ثم يصدّر التقرير إلى Excel أو CSV أو PDF.",
  "landing.note":
    "جرّب فاتورتين مجانًا بدون حساب · حساب مجاني = 5 فواتير شهريًا · Pro = 1000 فاتورة شهريًا.",
  "landing.f1.t": "قراءة مطبوع وخط اليد",
  "landing.f1.b": "AI/OCR يقرأ الفواتير المطبوعة والمكتوبة يدويًا ويستخرج كل الحقول.",
  "landing.f2.t": "استخراج كامل",
  "landing.f2.b": "المورد، رقم الفاتورة، التاريخ، المنتجات، الكمية، السعر، الخصم، KDV، الإجمالي.",
  "landing.f3.t": "تحقق حسابي",
  "landing.f3.b": "مقارنة مجموع البنود بالصافي والضريبة، وتعليم الفواتير التي تحتاج مراجعة.",
  "landing.f4.t": "تقارير جاهزة",
  "landing.f4.b": "تصدير Excel بورقتَي الفواتير والبنود، إضافة إلى CSV و PDF.",
  "landing.how": "كيف يعمل",
  "landing.s1": "1 — ارفع الفواتير (صور أو PDF)، أي عدد.",
  "landing.s2": "2 — الذكاء الاصطناعي يقرأها ويستخرج البيانات.",
  "landing.s3": "3 — تحقق حسابي وتعليم ما يحتاج مراجعة.",
  "landing.s4": "4 — تقرير بالمجاميع والضرائب قابل للتصدير.",
  "auth.login.title": "تسجيل الدخول",
  "auth.login.subtitle": "ادخل إلى سِجِلّ فواتيرك وتقاريرك",
  "auth.email": "البريد الإلكتروني",
  "auth.password": "كلمة المرور",
  "auth.confirmPassword": "تأكيد كلمة المرور",
  "auth.loggingIn": "جارٍ الدخول…",
  "auth.forgot": "نسيت كلمة المرور؟",
  "auth.noAccount": "ليس لديك حساب؟",
  "auth.hasAccount": "لديك حساب بالفعل؟",
  "auth.signup.title": "إنشاء حساب",
  "auth.signup.subtitle": "ابدأ بقراءة فواتيرك خلال دقيقة",
  "auth.creating": "جارٍ الإنشاء…",
  "auth.confirm.title": "تأكيد البريد الإلكتروني",
  "auth.confirm.subtitle": "بقيت خطوة واحدة",
  "auth.confirm.body.1": "أرسلنا رسالة تأكيد إلى",
  "auth.confirm.body.2": "افتح الرابط داخلها لتفعيل حسابك، ثم سجّل الدخول.",
  "auth.goLogin": "الذهاب إلى تسجيل الدخول",
  "toast.accountDisabled": "تم تعطيل هذا الحساب. تواصل مع الدعم.",
  "toast.badCredentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
  "toast.loggedIn": "تم تسجيل الدخول",
  "toast.emailFirst": "اكتب بريدك الإلكتروني أولًا",
  "toast.resetSent": "أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك",
  "toast.pwShort": "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
  "toast.pwMismatch": "كلمتا المرور غير متطابقتين",
  "toast.emailTaken": "هذا البريد مسجّل مسبقًا — سجّل الدخول",
  "toast.accountCreated": "تم إنشاء الحساب",
  "settings.title": "الإعدادات",
  "settings.back": "العودة إلى لوحة التحميل",
  "sub.title": "الاشتراك والفوترة",
  "sub.subtitle": "معلومات باقتك واستهلاكك — محدّثة من الخادم.",
  "sub.currentPlan": "الباقة الحالية",
  "sub.status": "حالة الاشتراك",
  "sub.start": "بداية الاشتراك",
  "sub.end": "ينتهي الاشتراك",
  "sub.renewal": "التجديد القادم",
  "sub.daysLeft": "المتبقي",
  "sub.days": "يومًا",
  "sub.invoices": "الفواتير",
  "sub.remaining": "المتبقي",
  "sub.invoicesWord": "فاتورة",
  "sub.usage": "استخدام الباقة",
  "sub.price": "سعر الباقة",
  "sub.nearLimit": "اقتربت من حد باقتك الشهري.",
  "sub.limitReached": "استنفدت عدد الفواتير المسموح بها في باقتك. لن تتمكن من رفع فواتير جديدة حتى تجديد الاشتراك أو الترقية إلى باقة أعلى.",
  "sub.upgrade": "ترقية الباقة",
  "sub.renew": "تجديد الاشتراك",
  "sub.cancel": "إلغاء الاشتراك",
  "sub.reactivate": "إعادة تفعيل الاشتراك",
  "sub.cancelTitle": "هل أنت متأكد أنك تريد إلغاء اشتراكك؟",
  "sub.cancelBody": "سيتوقف التجديد التلقائي فقط. يستمر اشتراكك حتى نهاية الفترة المدفوعة، ولن يُحذف حسابك ولا فواتيرك.",
  "sub.cancelConfirm": "نعم، ألغِ التجديد",
  "sub.cancelBack": "تراجع",
  "sub.cancelledUntil": "سيستمر اشتراكك حتى {date} ولن يتم تجديده بعد ذلك.",
  "sub.st.active": "نشط",
  "sub.st.expired": "منتهي",
  "sub.st.cancelled": "ملغى",
  "sub.st.inactive": "غير مفعّل",
  "sub.free.note": "أنت على الباقة المجانية.",
  "sub.noSub": "لا يوجد اشتراك مدفوع حاليًا.",
  "sub.toast.cancelled": "تم إيقاف التجديد التلقائي",
  "sub.toast.reactivated": "تمت إعادة تفعيل الاشتراك",
  "sub.unlimitedNote": "عملة الاشتراك مستقلة عن عملة فواتيرك.",
  "lang.label": "اللغة",
};

const en: Dict = {
  "brand.name": "Daftar",
  "brand.mark": "Df",
  "brand.tagline": "Smart purchase invoices",
  "nav.login": "Sign in",
  "nav.tryFree": "Try free",
  "nav.signup": "Create account",
  "landing.kicker": "Invoice AI",
  "landing.title": "Upload your purchase invoices and get a ready accounting report",
  "landing.subtitle":
    "Daftar reads your invoices with AI, extracts suppliers, products and prices, validates the math, and calculates tax and totals — then exports to Excel, CSV or PDF.",
  "landing.note":
    "Try 2 invoices free without an account · Free account = 5 invoices/month · Pro = 1000 invoices/month.",
  "landing.f1.t": "Printed & handwritten",
  "landing.f1.b": "AI/OCR reads both printed and handwritten invoices and extracts every field.",
  "landing.f2.t": "Full extraction",
  "landing.f2.b": "Supplier, invoice number, date, products, quantity, price, discount, VAT, total.",
  "landing.f3.t": "Arithmetic checks",
  "landing.f3.b": "Compares line totals with net and tax, and flags invoices needing review.",
  "landing.f4.t": "Ready reports",
  "landing.f4.b": "Excel export with Invoices and Items sheets, plus CSV and PDF.",
  "landing.how": "How it works",
  "landing.s1": "1 — Upload invoices (images or PDF), any amount.",
  "landing.s2": "2 — AI reads them and extracts the data.",
  "landing.s3": "3 — Arithmetic validation and review flags.",
  "landing.s4": "4 — An exportable report with totals and taxes.",
  "auth.login.title": "Sign in",
  "auth.login.subtitle": "Access your invoice records and reports",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.confirmPassword": "Confirm password",
  "auth.loggingIn": "Signing in…",
  "auth.forgot": "Forgot your password?",
  "auth.noAccount": "Don't have an account?",
  "auth.hasAccount": "Already have an account?",
  "auth.signup.title": "Create account",
  "auth.signup.subtitle": "Start reading your invoices in a minute",
  "auth.creating": "Creating…",
  "auth.confirm.title": "Confirm your email",
  "auth.confirm.subtitle": "One step left",
  "auth.confirm.body.1": "We sent a confirmation message to",
  "auth.confirm.body.2": "Open the link inside it to activate your account, then sign in.",
  "auth.goLogin": "Go to sign in",
  "toast.accountDisabled": "This account is disabled. Contact support.",
  "toast.badCredentials": "Incorrect email or password",
  "toast.loggedIn": "Signed in",
  "toast.emailFirst": "Enter your email first",
  "toast.resetSent": "We sent a password reset link to your email",
  "toast.pwShort": "Password must be at least 6 characters",
  "toast.pwMismatch": "Passwords do not match",
  "toast.emailTaken": "This email is already registered — sign in",
  "toast.accountCreated": "Account created",
  "settings.title": "Settings",
  "settings.back": "Back to upload dashboard",
  "sub.title": "Subscription & Billing",
  "sub.subtitle": "Your plan and usage — verified on the server.",
  "sub.currentPlan": "Current plan",
  "sub.status": "Subscription status",
  "sub.start": "Started on",
  "sub.end": "Expires on",
  "sub.renewal": "Next renewal",
  "sub.daysLeft": "Remaining",
  "sub.days": "days",
  "sub.invoices": "Invoices",
  "sub.remaining": "Remaining",
  "sub.invoicesWord": "invoices",
  "sub.usage": "Plan usage",
  "sub.price": "Plan price",
  "sub.nearLimit": "You are close to your monthly plan limit.",
  "sub.limitReached": "You have used all invoices in your plan. You cannot upload more until you renew or upgrade.",
  "sub.upgrade": "Upgrade Plan",
  "sub.renew": "Renew Subscription",
  "sub.cancel": "Cancel Subscription",
  "sub.reactivate": "Reactivate Subscription",
  "sub.cancelTitle": "Are you sure you want to cancel your subscription?",
  "sub.cancelBody": "Only auto-renewal stops. Your plan stays active until the end of the paid period; your account and invoices are not deleted.",
  "sub.cancelConfirm": "Yes, stop renewal",
  "sub.cancelBack": "Go back",
  "sub.cancelledUntil": "Your subscription stays active until {date} and will not renew afterwards.",
  "sub.st.active": "Active",
  "sub.st.expired": "Expired",
  "sub.st.cancelled": "Cancelled",
  "sub.st.inactive": "Inactive",
  "sub.free.note": "You are on the free plan.",
  "sub.noSub": "No paid subscription right now.",
  "sub.toast.cancelled": "Auto-renewal stopped",
  "sub.toast.reactivated": "Subscription reactivated",
  "sub.unlimitedNote": "Subscription currency is separate from your invoice currency.",
  "lang.label": "Language",
};

const tr: Dict = {
  "brand.name": "Daftar",
  "brand.mark": "Df",
  "brand.tagline": "Akıllı alış faturaları",
  "nav.login": "Giriş yap",
  "nav.tryFree": "Ücretsiz dene",
  "nav.signup": "Hesap oluştur",
  "landing.kicker": "Invoice AI",
  "landing.title": "Alış faturalarınızı yükleyin, hazır muhasebe raporunu alın",
  "landing.subtitle":
    "Daftar faturalarınızı yapay zekâ ile okur; tedarikçileri, ürünleri ve fiyatları çıkarır, hesapları doğrular, KDV ve toplamı hesaplar — ardından Excel, CSV veya PDF olarak dışa aktarır.",
  "landing.note":
    "Hesapsız 2 fatura ücretsiz · Ücretsiz hesap = ayda 5 fatura · Pro = ayda 1000 fatura.",
  "landing.f1.t": "Matbu ve el yazısı",
  "landing.f1.b": "AI/OCR hem matbu hem el yazısı faturaları okur ve tüm alanları çıkarır.",
  "landing.f2.t": "Tam veri çıkarımı",
  "landing.f2.b": "Tedarikçi, fatura no, tarih, ürünler, miktar, fiyat, iskonto, KDV, toplam.",
  "landing.f3.t": "Aritmetik doğrulama",
  "landing.f3.b": "Kalem toplamlarını net ve vergiyle karşılaştırır, inceleme gerekenleri işaretler.",
  "landing.f4.t": "Hazır raporlar",
  "landing.f4.b": "Faturalar ve Kalemler sayfalarıyla Excel dışa aktarımı, ayrıca CSV ve PDF.",
  "landing.how": "Nasıl çalışır",
  "landing.s1": "1 — Faturaları yükleyin (görsel veya PDF), sınırsız sayıda.",
  "landing.s2": "2 — Yapay zekâ okur ve verileri çıkarır.",
  "landing.s3": "3 — Aritmetik doğrulama ve inceleme işaretleri.",
  "landing.s4": "4 — Toplam ve vergileri içeren dışa aktarılabilir rapor.",
  "auth.login.title": "Giriş yap",
  "auth.login.subtitle": "Fatura kayıtlarınıza ve raporlarınıza erişin",
  "auth.email": "E-posta",
  "auth.password": "Şifre",
  "auth.confirmPassword": "Şifreyi doğrula",
  "auth.loggingIn": "Giriş yapılıyor…",
  "auth.forgot": "Şifrenizi mi unuttunuz?",
  "auth.noAccount": "Hesabınız yok mu?",
  "auth.hasAccount": "Zaten hesabınız var mı?",
  "auth.signup.title": "Hesap oluştur",
  "auth.signup.subtitle": "Bir dakikada faturalarınızı okumaya başlayın",
  "auth.creating": "Oluşturuluyor…",
  "auth.confirm.title": "E-postanızı doğrulayın",
  "auth.confirm.subtitle": "Tek adım kaldı",
  "auth.confirm.body.1": "Doğrulama mesajını şuraya gönderdik:",
  "auth.confirm.body.2": "İçindeki bağlantıyı açarak hesabınızı etkinleştirin, sonra giriş yapın.",
  "auth.goLogin": "Girişe git",
  "toast.accountDisabled": "Bu hesap devre dışı. Destek ile iletişime geçin.",
  "toast.badCredentials": "E-posta veya şifre hatalı",
  "toast.loggedIn": "Giriş yapıldı",
  "toast.emailFirst": "Önce e-postanızı yazın",
  "toast.resetSent": "Şifre sıfırlama bağlantısını e-postanıza gönderdik",
  "toast.pwShort": "Şifre en az 6 karakter olmalı",
  "toast.pwMismatch": "Şifreler eşleşmiyor",
  "toast.emailTaken": "Bu e-posta zaten kayıtlı — giriş yapın",
  "toast.accountCreated": "Hesap oluşturuldu",
  "settings.title": "Ayarlar",
  "settings.back": "Yükleme paneline dön",
  "sub.title": "Abonelik ve Faturalandırma",
  "sub.subtitle": "Paketiniz ve kullanımınız — sunucuda doğrulanır.",
  "sub.currentPlan": "Mevcut paket",
  "sub.status": "Abonelik durumu",
  "sub.start": "Başlangıç",
  "sub.end": "Bitiş tarihi",
  "sub.renewal": "Sonraki yenileme",
  "sub.daysLeft": "Kalan",
  "sub.days": "gün",
  "sub.invoices": "Faturalar",
  "sub.remaining": "Kalan",
  "sub.invoicesWord": "fatura",
  "sub.usage": "Paket kullanımı",
  "sub.price": "Paket fiyatı",
  "sub.nearLimit": "Aylık paket limitinize yaklaştınız.",
  "sub.limitReached": "Paketinizdeki tüm faturaları kullandınız. Yenilemeden veya yükseltmeden yeni fatura yükleyemezsiniz.",
  "sub.upgrade": "Paketi Yükselt",
  "sub.renew": "Aboneliği Yenile",
  "sub.cancel": "Aboneliği İptal Et",
  "sub.reactivate": "Aboneliği Yeniden Etkinleştir",
  "sub.cancelTitle": "Aboneliğinizi iptal etmek istediğinize emin misiniz?",
  "sub.cancelBody": "Yalnızca otomatik yenileme durur. Ödediğiniz dönemin sonuna kadar paketiniz devam eder; hesabınız ve faturalarınız silinmez.",
  "sub.cancelConfirm": "Evet, yenilemeyi durdur",
  "sub.cancelBack": "Vazgeç",
  "sub.cancelledUntil": "Aboneliğiniz {date} tarihine kadar devam edecek ve sonrasında yenilenmeyecek.",
  "sub.st.active": "Aktif",
  "sub.st.expired": "Süresi Doldu",
  "sub.st.cancelled": "İptal edildi",
  "sub.st.inactive": "Pasif",
  "sub.free.note": "Ücretsiz paketi kullanıyorsunuz.",
  "sub.noSub": "Şu anda ücretli abonelik yok.",
  "sub.toast.cancelled": "Otomatik yenileme durduruldu",
  "sub.toast.reactivated": "Abonelik yeniden etkinleştirildi",
  "sub.unlimitedNote": "Abonelik para birimi, fatura para biriminden bağımsızdır.",
  "lang.label": "Dil",
};

const DICTS: Record<Lang, Dict> = { ar, en, tr };

const normalize = (value: string | undefined | null): Lang => {
  const v = (value ?? "").toLowerCase().slice(0, 2);
  return v === "en" || v === "tr" ? v : "ar";
};

type Ctx = { lang: Lang; dir: "rtl" | "ltr"; t: (key: string) => string; setLang: (l: Lang) => void };

const I18nContext = createContext<Ctx>({
  lang: "ar",
  dir: "rtl",
  t: (k) => ar[k] ?? k,
  setLang: () => undefined,
});

export function I18nProvider({
  defaultLang = "ar",
  children,
}: {
  defaultLang?: string;
  children: ReactNode;
}) {
  const fallback = normalize(defaultLang);
  const [lang, setLangState] = useState<Lang>(fallback);

  // the site default comes from Admin → Settings; a visitor choice overrides it locally
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    setLangState(stored ? normalize(stored) : fallback);
  }, [fallback]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = dirOf(lang);
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const t = useCallback((key: string) => DICTS[lang][key] ?? ar[key] ?? key, [lang]);

  const value = useMemo<Ctx>(() => ({ lang, dir: dirOf(lang), t, setLang }), [lang, t, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <select
      aria-label={t("lang.label")}
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className={`rounded-full border border-border bg-background px-2 py-1.5 text-[12px] font-bold outline-none ${className}`}
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

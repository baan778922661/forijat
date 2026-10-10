# فُرِجَت — Backend API (Node.js / Express)

واجهة خلفية لمنصة "فُرِجَت" وفق وثيقة المتطلبات: حجز فنيين، نظام ضمان مالي مشروط (Escrow)، محفظة ثلاثية الأرصدة، سحوبات يومية، ضمان 14 يوماً، وتكامل Cloudinary.

## التشغيل محلياً
```bash
cp .env.example .env   # عبّئ القيم
npm install
node seed/seed.js      # مرة واحدة: حساب أدمن + قنوات دفع
npm run dev
```

## النشر على Render (خطة مجانية)
1. ارفع المشروع إلى GitHub واربطه بخدمة Web جديدة (أو استخدم `render.yaml`).
2. عيّن متغيرات البيئة من `.env.example`.
3. نفّذ `node seed/seed.js` مرة واحدة من Render Shell.

## منع نوم الخادم (Cold Starts)
- الـ endpoint الجاهز: `GET /api/v1/health`.
- في [cron-job.org](https://cron-job.org) (مجاني): أنشئ مهمتين:
  1. `GET  https://<your-app>.onrender.com/api/v1/health` — كل **10 دقائق**.
  2. `POST https://<your-app>.onrender.com/api/v1/internal/release-pending` — كل **10 دقائق**، مع الترويسة `x-cron-secret: <CRON_SECRET>` لتحرير الأرصدة المعلقة بعد ساعتين من الـ OTP.

## خريطة المسارات
| المسار | الدور | الوصف |
|---|---|---|
| `POST /api/v1/auth/register` `/login` | عام | تسجيل/دخول (JWT) |
| `PATCH /api/v1/auth/location` `/availability` | فني | تحديث الموقع GeoJSON والتوفّر |
| `GET /api/v1/payment-methods` | مصادق | قنوات الدفع الفعّالة |
| `POST /api/v1/orders` | عميل | حجز (فئة + إحداثيات + أقرب معلم + أجر الكشف) |
| `POST /api/v1/orders/:id/inspection-proof` | عميل | رفع سند التحويل (multipart, field: `image`) |
| `GET /api/v1/orders/:id/otp` | عميل | عرض رمز الاستلام لتسليمه للفني |
| `POST /api/v1/orders/:id/labor-fee` | فني | اقتراح أجر يد إضافي |
| `POST /api/v1/orders/:id/labor-proof` | عميل | الموافقة + رفع سند أجر اليد |
| `POST /api/v1/orders/:id/spare-parts` | فني | رفع فاتورة القطع المختومة (خارج العمولة) |
| `POST /api/v1/orders/:id/complete` | فني | إدخال OTP ← توزيع مالي + ضمان 14 يوماً |
| `GET /api/v1/wallet` `/transactions` | فني | الأرصدة الثلاثة والسجل |
| `POST /api/v1/wallet/withdraw` | فني | طلب سحب يومي (available→locked ذرياً) |
| `GET /api/v1/admin/orders/payment-queue` | أدمن | سندات قيد المراجعة |
| `POST /api/v1/admin/orders/:id/approve` | أدمن | اعتماد ← `$geoNear` يعيّن أقرب فني مؤهل |
| `GET /api/v1/admin/withdrawals` | أدمن | طلبات السحب مجمعة حسب القناة |
| `POST /api/v1/admin/withdrawals/:id/complete` | أدمن | رفع سند التحويل (field: `receipt`) + رقم الإشعار |
| `POST /api/v1/internal/release-pending` | cron | تحرير الأرصدة المعلقة بعد ساعتين |

## ضمانات مالية مدمجة
- كل حركات الرصيد ذرية (`$inc` مع شروط `$gte` داخل الاستعلام) — لا توجد قراءة-ثم-حفظ، والرصيد السالب مستحيل بنيوياً.
- العمولة (15–20%) تُقتطع قبل إضافة صافي الأجر إلى `pendingBalance`.
- السحب ينقل المبلغ `available → locked` في عملية واحدة مشروطة بالرصيد الكافي.

## ملاحظات للعميل (Flutter)
- اضغط الصور قبل الرفع عبر `flutter_image_compress` (≤300KB، ≤1280×720). الخادم يفرض حداً أقصى 2MB ويعيد الضغط على Cloudinary كشبكة أمان.
- المسارات الخفيفة (`myOrders`) تعيد حقولاً مقلّمة (`lean/select`) لتناسب الشبكات الضعيفة، مع دعم التخزين المؤقت المحلي في التطبيق.

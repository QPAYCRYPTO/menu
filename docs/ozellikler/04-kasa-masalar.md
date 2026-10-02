# 04 — Kasa (Ödemeler), Masalar ve QR

> Özellik kataloğu · bölüm 4/5. Test katmanları: **K1** birim/hesaplama · **K2** API akış (gerçek veritabanı) · **K3** tarayıcı (E2E).
> Para her yerde kuruş cinsinden tam sayı (`*_int`). Kasa ve masa uçları yalnız admin/süper admin (`requireAuth` + `requireAdmin`).

**Ana formül** (`apps/api/src/services/paymentLedgerService.ts:25-39`, `computeLedger`):
- `total_int` = teslim edilmiş siparişlerin kalemleri Σ(fiyat × adet)
- `discount_int` = iptal edilmemiş indirim + ikram
- `paid_int` = iptal edilmemiş ödemeler
- `remaining_int` = total − discount − paid — **sıfırda kırpılmıyor, negatif olabilir**

**Canlı yenileme:** yazma uçları `tables_changed` yayınlar (sessions, payment, payments, discounts, table-operations); **masa uçları (tableRoutes) yayınlamaz.** Web `atlasqr:tables-changed` olayına çevirir.

**Test ön koşulları:**
- K1: `parseMoney`, `toMoneyInput`, bölme payı ve indirim önizlemesi `CashierPage.tsx` içinde; test için `lib/money.ts`'e çıkarılmalı.
- K2: Gerçek Postgres'li test kurulumu (migration 001–023 + demo veri).

---

## A. Kasa / Ödemeler — `/admin/kasa` (`apps/web/src/pages/CashierPage.tsx`)

### KAS-001 — Masa listesi yükleme ve yoklama
- **Nerede:** `CashierPage.tsx:93-113` · `GET /api/admin/tables` (`tableRoutes.ts:29-39`), `GET /api/admin/sessions` (`sessionRoutes.ts:26-52`).
- **Kurallar:** 10 sn'de bir yoklama. Birleşmiş oturumun tutarı 0 gösterilir. Sayaçlar yalnız `type='order'`.
- **Test:** K2 + K3 — birleşmiş satır 0, açık satır doğru; B işletmesi A'nın oturumlarını görmez.

### KAS-002 — Liste sıralaması (hesap istendi → açık → boş)
- **Nerede:** `CashierPage.tsx:137-197`.
- **Kurallar:** Hesap isteği en eski başta; açık hesaplar en eski açılan başta; boş masalar sıra no + Türkçe ad.
- **Test:** K1 + K3 — D (hesap istendi), B (09:30), A (10:00), C (boş) → sıra D, B, A, C.

### KAS-003 — Birleşik masa gösterimi
- **Nerede:** `CashierPage.tsx:140-168, 302-306, 767-771`.
- **Kurallar:** Zincir `merged_into_session_id` ile izlenir (döngü korumalı). Kaynak masanın adresi de doğru hesabı açar.
- **Test:** K1 + K3 — A→B→C zinciri tek satır; `?masa=A` C'nin panelini açar.

### KAS-004 — Hesap isteği ve "Görüldü"
- **Nerede:** `CashierPage.tsx:132-135, 180-187, 211-213, 264-268, 331-353`.
- **Kurallar:** Hesap kapanınca istek otomatik kapanır. Hatalar sessizce yutulur.
- **Test:** K1 (`formatElapsed`) + K3.

### KAS-005 — Hesap özeti (`/admin/sessions/:id/summary`)
- **Nerede:** `CashierPage.tsx:570-584` · `sessionRoutes.ts:57-63` → `getSessionSummary` (`paymentLedgerService.ts:80-123`).
- **Kurallar:** Birleşik oturum verilirse zincir sonu döner; açık değilse 404. İptal edilmiş ödemeler listede görünür ama toplama girmez.
- **Test:** K2 — teslim 2×5.000 + hazırlanan 1×3.000, %10 indirim, 2.000 ödeme → total 10.000, indirim 1.000, ödenen 2.000, kalan 7.000.

### KAS-006 — Adisyona yalnız teslim edilenler; "Teslim bekleyen" bölümü
- **Nerede:** `CashierPage.tsx:596-598, 829-887` · kural `computeLedger`.
- **Kurallar:** Teslim edilmemiş kalem toplamda yok, seçilemez; ürünle ödeme ve ikram 409.
- **Test:** K2 + K3 — hazır kalemle ödeme 409; teslim edilince toplam artar.

### KAS-007 — Ürün seçimi ve "Tümünü seç"
- **Nerede:** `CashierPage.tsx:611-618, 819-861`.
- **Kurallar:** Tahsil tutarı = min(seçilenler, kalan) (sunucu da aynı).
- **Test:** K1 + K2 — kalan 9.000'de A (6.000) sonra B (4.000) → ikinci ödeme 3.000'e kırpılır.

### KAS-008 — Tutar girişi (`parseMoney`) ve "Tamamını öde"
- **Nerede:** `CashierPage.tsx:357-368, 1013-1032`.
- **Kurallar:** Virgül varsa nokta binlik sayılır; yoksa nokta ondalık. Öncelik: ürün > bölme > elle tutar. Sunucu: tam sayı, >0, kalandan büyükse 409.
- **Test:** K1 — `"150,50"`→15050, `"1.250,00"`→125000, `"12 TL"`→1200, `""`/`"-5"`/`"abc"`→null. **Hata yakalayanlar:** `"1.250"`→125 (beklenen 125000), `"1e3"`, `"0x10"` kabul ediliyor.

### KAS-009 — Eşit bölme
- **Nerede:** `CashierPage.tsx:626-633, 959-1010`.
- **Kurallar:** 2–50 kişi; pay = yukarı yuvarlanmış kalan/n, bölme başında bir kez; tahsil = min(pay, güncel kalan).
- **Test:** K1 + K3 — kalan 10.000, n=3 → 3.334 + 3.334 + 3.332; kalan 10.001, n=2 → 5.001 + 5.000.

### KAS-010 — Ödeme yöntemleri (Nakit / Kart / Yemek Kartı)
- **Nerede:** `CashierPage.tsx:370-375, 968-983` · `022_payments.sql:11`.
- **Test:** K2 — yemek kartı → `payments.method='meal_card'`; `'crypto'` → 400.

### KAS-011 — Nakitte alınan ve para üstü
- **Nerede:** `CashierPage.tsx:376, 608-609, 1035-1058`.
- **Kurallar:** Para üstü negatifse uyarı çıkar ama **Tahsil Et engellenmiyor**; alınan tutar kaydedilmiyor.
- **Test:** K1 + K3 — 73,50 tutarda 100 alınca 26,50 para üstü.

### KAS-012 — Tahsil Et (`createPayment`)
- **Nerede:** `CashierPage.tsx:635-657` · `POST /api/admin/payments` (`ledgerRoutes.ts:34-50`) → `paymentLedgerService.ts:128-206`.
- **Kurallar:** Oturum kilitlenir. Kalan ≤0 → 409. Ürünle: teslim edilmemiş/ödenmiş/ikramlı → 409. Tutar kalandan büyük → 409.
- **Test:** K2 — 10.000'den 4.000 → kalan 6.000; 6.001 → 409; **eşzamanlı iki 6.000'lik istek → biri 201, diğeri 409** (kilit testi).

### KAS-013 — İndirim (% / TL)
- **Nerede:** `CashierPage.tsx:406-450` · `POST /api/admin/discounts` (`ledgerRoutes.ts:76-106`) → `paymentLedgerService.ts:244-315`.
- **Kurallar:** Hesap indirimi tabanı = toplam − mevcut indirim (ödenenler düşülmez); kalana kırpılır. Ürün bazlı indirim API'de var, arayüzde yok.
- **Test:** K1 + K2 — %15 → 1.500; ödenen 9.500 iken %10 → 500'e kırpılır; %10 iki kez → 1.000 + 900.

### KAS-014 — İkram (ürün / tüm hesap, not zorunlu)
- **Nerede:** `CashierPage.tsx:453-504`.
- **Kurallar:** Not zorunlu (istemci ve sunucu). Ürün ikramı: teslim edilmiş, ödenmemiş, daha önce ikram edilmemiş. Tüm hesap = o anki kalan.
- **Test:** K2 + K3 — boş not 400; aynı ürüne ikinci ikram 409; kalan 2.000'de 3.000'lik ürün → 2.000'e kırpılır.

### KAS-015 — İndirim / ikram kaldırma
- **Nerede:** `CashierPage.tsx:671-683, 889-908` · `DELETE /api/admin/discounts/:id`.
- **Kurallar:** Kapalı hesapta 409. **Hata olursa bildirim çıkmıyor** (onay penceresi açık kalıyor).
- **Test:** K2.

### KAS-016 — Ödeme geçmişi ve sebepli iptal
- **Nerede:** `CashierPage.tsx:507-533, 685-696, 910-934` · `DELETE /api/admin/payments/:id`.
- **Kurallar:** Sebep ≥2 karakter. Ürünle yapılmış ödemede kalemler yeniden "ödenmemiş" olur. Kapalı hesapta 409. **Oturum satırı kilitlenmiyor.**
- **Test:** K2.

### KAS-017 — Hesabı kapatma (kalan 0 olmalı) ve açık sipariş kararı
- **Nerede:** `CashierPage.tsx:698-724` · `POST /api/admin/payment/close-table` (`paymentRoutes.ts:95-159`) → `paymentService.ts:141-349`.
- **Kurallar:**
  1. Kalan > 0 → 409; `force_close` bunu aşamaz.
  2. Bekleyen/hazırlanan/hazır her sipariş için karar gerekir ("İptal Et" / "Zayi Say").
  3. Birleşik gruptaki oturumlar ve besleyici kaynaklar da kapanır.
  - **Fazla ödemede (kalan < 0) sessizce kapanıyor.**
- **Test:** K2 + K3.

### KAS-018 — Açık sipariş karar paneli
- **Nerede:** `components/payment/OpenOrdersDecisionPanel.tsx:24-123`.
- **Test:** K3 — 2 siparişten 1'ine karar → düğme pasif.

### KAS-019 — Bekleyenleri yeni hesaba taşıma
- **Nerede:** `CashierPage.tsx:726-737` · `POST /api/admin/sessions/:id/close {action:'transfer'}` (`sessionRoutes.ts:99-225`).
- **Kurallar:** Kalan > 0 → 409 `BALANCE_DUE`. `cancel_pending` mutfağa olay yayınlamıyor.
- **Test:** K2.

### KAS-020 — Mobil tam ekran ve canlı yenileme
- **Nerede:** `CashierPage.tsx:116-130, 251-253, 587-592, 761-763`.
- **Test:** K3 — 375 px'te tam ekran; başka sekmedeki ödeme ~1 sn içinde yansır.

### KAS-021 — Eski uçlar
- **Nerede:** `paymentRoutes.ts:35-45, 56-84, 166-190, 197-226`.
- **Kurallar:** `new-orders?since=abc` → 500 (400 olmalı). Eski hesap uç noktası yanlış kalan döndürüyor.
- **Test:** K2.

## B. Masalar — `/admin/tables` (`apps/web/src/pages/TablesPage.tsx`)

### MAS-001 — Masa ekleme
- **Nerede:** `TablesPage.tsx:122-133, 239-251` · `POST /api/admin/tables` (`tableRoutes.ts:42-61`).
- **Kurallar:** Ad 1–60 karakter; aynı ad tekrar kullanılabilir; canlı olay yok.
- **Test:** K2.

### MAS-002 — Düzenleme / pasif yapma / silme
- **Nerede:** `TablesPage.tsx:135-170, 543-558` · `PUT` / `DELETE /api/admin/tables/:id` (`tableRoutes.ts:64-107`).
- **Kurallar:** **Açık hesabı olan masa pasif yapılabiliyor / silinebiliyor.** Geçersiz id → 500. "Sil" ile "Pasif" aynı işlem.
- **Test:** K2.

### MAS-003 — Doluluk istatistikleri
- **Nerede:** `TablesPage.tsx:253-282` · **Test:** K1.

### MAS-004 — Birleşik grup kartı ve hedefe yönlendirme
- **Nerede:** `TablesPage.tsx:187-226, 471-483, 517-523` · **Test:** K3.

### MAS-005 — Kasaya Git ve Detay penceresi
- **Nerede:** `TablesPage.tsx:91, 172-184, 317-390` · `GET /api/admin/sessions/:id`.
- **Kurallar:** **Detay, iptal edilenleri ve garson çağrılarını da listeliyor;** "Bekliyor" sayısı çağrıları da sayıyor.
- **Test:** K2 + K3.

### MAS-006 — Masa taşıma
- **Nerede:** `POST /api/admin/table-operations/move` (`tableOperationsRoutes.ts:87-105`), `moveSession`.
- **Kurallar:** Hedef aktif ve boş olmalı. Ödeme ve indirimler oturumla birlikte taşınır. **Aynı masa kontrolü fiilen hiç çalışmıyor.**
- **Test:** K2.

### MAS-007 — Masa birleştirme (ödeme ve indirimler de taşınır)
- **Nerede:** `.../merge` (`tableOperationsRoutes.ts:108-126`), `mergeSessions` (`tableOperationsService.ts:169-304`).
- **Kurallar:** Ters yönde eşzamanlı birleştirmede kilitlenme (deadlock) riski.
- **Test:** K2 — A (6.000, 2.000 ödenmiş, 500 indirim) + B (4.000) → B'de total 10.000, indirim 500, ödenen 2.000, kalan 7.500.

### MAS-008 — Sipariş transferi
- **Nerede:** `.../transfer-orders`, `transferOrders` (`tableOperationsService.ts:312-463`).
- **Kurallar:** **Ödemeler ve indirimler taşınmıyor; kapalı hesaptan sipariş taşınabiliyor.**
- **Test:** K2 (hataları belgeleyen testler).

### MAS-009 — Oturum çözümleme / oluşturma ve adisyon tutarı (`cached_total`)
- **Nerede:** `sessionService.ts:40-204`.
- **Kurallar:** Tutar yalnız teslimde artar, teslim geri alınınca ya da teslim edilmiş sipariş iptal edilince azalır.
- **Test:** K2 — aynı boş masaya eşzamanlı iki sipariş → tek oturum.

### MAS-010 — Otomatik kapanış
- **Nerede:** `waiterPublicRoutes.ts:41-68`.
- **Kurallar:** **Ödeme, indirim ve besleyici oturumlar kontrol edilmiyor.**
- **Test:** K2.

## C. QR Kod — `/admin/qr` (`apps/web/src/pages/QrPage.tsx`)

### QR-001 — Genel menü QR'ı ve link kopyalama
- **Nerede:** `QrPage.tsx:34-60, 108-148` · `GET /api/admin/qr` (`adminRoutes.ts:259-302`).
- **Kurallar:** QR içeriği `/m/<slug>`; işletme rengiyle 512 px PNG.
- **Test:** K2 + K3.

### QR-002 — Masa QR'ı oluşturma, indirme ve depoya kaydetme
- **Nerede:** `QrPage.tsx:62-82, 188-228`.
- **Kurallar:** Masa linki `/m/<slug>?masa=<id>`. `content` parametresi serbest metin. İlk seferde depoya yüklenir, tema değişince yenilenmez.
- **Test:** K2 + K3 — **ağ hatasından sonra "İndir" önceki masanın QR'ını yanlış adla indiriyor.**

---

## Riskli alanlar / olası hatalar

**Para**
- **R-01** `parseMoney` binlik ayırıcı hatası: "1.250" → 1,25 TL (kullanıcı 1.250 TL kastediyor). İndirim TL modunda da aynı fonksiyon.
- **R-02** Fazla ödeme (kalan < 0) fark edilmiyor, iade akışı yok. Negatife düşüren yollar: ödenmiş teslim siparişinin admin tarafından iptali; teslim → hazır geri alma; ikramlı kalemin siparişi iptal edilince indirim kaydının kalması; sipariş transferi.
- **R-03** Bekleyenleri yeni hesaba taşırken adisyon tutarı iki kez sayılıyor (teslimde tekrar ekleniyor).
- **R-04** Sipariş transferi ödemeleri ve ikramları taşımıyor; müşteri iki kez ödeyebilir.
- **R-05** Ürün bazlı indirim, o ürünün seçilerek ödenmesini engelliyor ve "İkram" etiketiyle görünüyor.
- **R-06** Kalana kırpılan ikramda ürün "tam ikram" görünüyor.
- **R-08** Ödeme ve indirim iptalinde oturum kilidi yok; kapatma ile yarışta kalanı olan kapalı hesap oluşabilir.
- **R-11** Yüzde indirim tabanı ödenenleri düşmüyor; "%10" etiketiyle farklı bir tutar görünebilir.
- **R-12** Tutarla ödeme sonrası ürünle ödeme: kalan 0 ama bazı kalemler "ödenmemiş" kalıyor; müşteri ekranı farklı kalan gösteriyor.
- **R-13** Para üstü negatifken Tahsil Et engellenmiyor.

**Masa ve oturum**
- **R-07** Birleşmiş kaynak oturumlar artık kalıyor (bazı kapatma yolları onları kapatmıyor): masa Kasa'da hiç görünmüyor, Masalar'da "Birleşik, 0,00 TL".
- **R-09** Otomatik kapanış ödeme ve indirimleri yok sayıyor.
- **R-14** Açık hesaplı masa pasif yapılabiliyor; birçok uçta id doğrulaması yok (500); masa uçları canlı olay yayınlamıyor.
- **R-16** Masa taşımada aynı masa kontrolü çalışmıyor; ters yönlü eşzamanlı birleştirmede kilitlenme riski.

**Arayüz**
- **R-10** Bölme payı sonradan değişen kalana göre güncellenmiyor.
- **R-15** QR sayfası: yanlış QR yanlış adla inebiliyor; bellek sızıntısı; `content` serbest.
- **R-17** İndirim kaldırma hatasında bildirim yok.
- **R-18** `cancel_pending` mutfağa olay yayınlamıyor.
- **R-19** Eski hesap uç noktası yanlış kalan döndürüyor.
- **R-20** Migration 022'de mükerrer kayıt riski (düşük).

**Öncelikli test sırası:** (1) K2 ödeme/iptal/indirim, kilit ve kırpma senaryolarıyla · (2) R-02, R-03, R-04, R-07'yi belgeleyen (başta kırmızı) testler · (3) K1 `parseMoney`, bölme, indirim önizleme · (4) K3 kapatma akışı ve mobil.

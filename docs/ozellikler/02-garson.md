# 02 — Garson (personel) uygulaması

> Özellik kataloğu · bölüm 2/5. Test katmanları: **K1** birim · **K2** API akış (gerçek veritabanı) · **K3** tarayıcı (E2E, çoklu sekme/cihaz).
> Rotalar: `/g/:token`, `/garson/giris`, `/garson` (Masalar), `/garson/cagrilar`, `/garson/profil`, `/garson/masa/:id`, `/garson/masa/:id/menu` (`apps/web/src/App.tsx:121-128`).
> **Mevcut test durumu:** Garson modülüne ait hiçbir test yok (bütün özellikler için "Mevcut test: yok").

---

## A. Oturum / giriş

### GRS-001 — QR veya link ile giriş (token exchange)
- **Ne yapar:** `/g/:token` açılınca sekmeye özel `tab_id` üretilir, token takas edilir, `/garson`'a gidilir.
- **Nerede:** `WaiterLoginPage.tsx:30-59`, `WaiterAuthContext.tsx:202-222` · `POST /api/public/waiter/exchange` (`waiterPublicRoutes.ts:191-224`), `waiterService.registerSessionTab` (`waiterService.ts:607-683`).
- **Kurallar:**
  - Token 10-200 karakter, `tab_id` UUID (400).
  - Ret nedenleri (401 + reason): `invalid_token`, `revoked`, `expired`, `waiter_inactive`, `business_suspended`, `module_disabled`.
  - Aynı tab_id'nin eski kaydı revoke edilip yeni kayıt eklenir — **transaction dışında**.
  - İlk sekmede `shift_start` kaydı ve `staff_update` olayı.
  - Başarıda token URL'den silinir. 429/5xx "Bağlantı hatası" görünür (yanıltıcı).
  - `crypto.randomUUID` güvenli olmayan bağlamda (http + yerel IP) yok; giriş takılı kalır.
- **Test:** K1, K2, K3
  - K2: geçerli token → 200, 1 aktif sekme kaydı, `shift_start` logu.
  - K2: admin token yeniledi → eski token 401 `revoked`; süresi geçmiş → `expired`; modül kapalı → `module_disabled`.
  - K3: adres çubuğu `/garson` olur; geçersiz token → "Giriş yapılamadı" kartı.

### GRS-002 — E-posta + şifre ile giriş (geçici)
- **Nerede:** `WaiterLoginPage.tsx:79-96, 138-179` · `POST /api/public/waiter/login` (`waiterPublicRoutes.ts:105-128`).
- **Kurallar:** **Fiilen işlevsiz:** başarılı olsa da oturum kaydedilmiyor, yalnızca bir uyarı çıkıyor. Kullanıcı var mı sızdırılmıyor (hep `invalid_credentials`).
- **Test:** K2 (doğru/yanlış şifre, 11. denemede 429) + K3 (mevcut davranışın kaydı).

### GRS-003 — Sekme oturumu; aynı tarayıcıda birden fazla personel
- **Ne yapar:** Her sekme kendi oturumunu `sessionStorage`'da tutar; cihazdaki oturumlar `localStorage`'da personel bazında saklanır. F5 sonrası sekmenin personeli değişmez.
- **Nerede:** `WaiterAuthContext.tsx:23-118`, `checkStoredSession` :138-172.
- **Kurallar:**
  - Sekmede kayıt yoksa cihazdaki en yeni oturum alınır ve sekme ona bağlanır.
  - `clearStored` yalnız bu sekmenin personelini siler. `loginWithToken` önce `clearStored()` çağırır.
  - **Bilinen risk:** boş sekme ya da "sekmeyi çoğalt" aynı `tab_id`'yi paylaşır; exchange'in revoke/insert yarışında diğer sekme `invalid_tab` alabilir, çıkış diğerini de düşürür.
- **Test:** K1, K3 (öncelikli)
  - K3 (bilinen regresyon): Sekme A'da X, sekme B'de Y; ikisinde F5 → kendi personelinde kalır, 30 sn boyunca 401 yok.
  - K3: A'da çıkış → B çalışmaya devam eder.
  - K3: A açıkken boş sekme C'de `/garson` → A'da 401 olmamalı (20 kez tekrar).
  - K1: eski (v5) anahtar taşınır; `clearStored` diğer personele dokunmaz.

### GRS-004 — Oturum sonu ve neden mesajları (401)
- **Nerede:** `waiterPublicApi.ts:203-216`, `WaiterAuthContext.tsx:160-194`, `WaiterLoginPage.tsx:23`.
- **Kurallar:** Personel pasif yapılınca ya da silinince oturumlar revoke edilir. **Masa taşıma/birleştirme istemcisi 401'i yayınlamıyor** — yalnız genel hata çıkar.
- **Test:** K2, K3 — link yenilenince bir sonraki yoklamada "Giriş linkin yenilendi…"; API kapalıyken oturum silinmez; taşıma modalında süre dolunca giriş ekranına yönlenmeli (şu an yönlenmiyor).

### GRS-005 — Çıkış ve vardiya giriş/çıkış kaydı
- **Nerede:** `WaiterLayout.tsx:72-75` · `POST /api/public/waiter/logout` (`waiterPublicRoutes.ts:234-247`), `staffService.ts:134-148`.
- **Kurallar:** Logout **kimlik doğrulamasız**. Son sekme kapanınca `shift_end`; sekme kapatılınca logout çağrılmıyor.
- **Test:** K2 — 2 sekmede 1. logout → shift_end yok, 2. → var; revoke edilmiş sekme ile istek → 401.

### GRS-006 — Sunucu tarafı garson kimlik doğrulaması
- **Nerede:** `middleware/waiterAuth.ts:31-73`, `waiterService.ts:492-532, 693-748`.
- **Kurallar:** Yetkiler her istekte taze okunur. **`X-Tab-ID` gönderilmezse yalnız token ile doğrulanır** (sekme bağlama atlatılabiliyor).
- **Test:** K2 — header yok → 401; yanlış sekme → `invalid_tab`; sekmesiz → bugün 200 (kapatılmalı); başka işletmenin masası → 404.

### GRS-007 — Garson rate limitleri
- **Nerede:** `rateLimit.ts:15-41, 80-92`.
- **Kurallar:** Oturum yenileme 30/dk (IP + sekme), giriş 10/dk (IP + e-posta). Kimliği doğrulanmış uçlarda limit yok.
- **Test:** K2 — aynı Wi-Fi'den 3 sekme × 25 istek → 429 yok; tek sekme 31. istek → 429.

## B. Yerleşim

### GRS-008 — Başlık, alt menü, koruma
- **Nerede:** `WaiterLayout.tsx`.
- **Kurallar:** Oturum yoksa giriş ekranı. Moladaysa "Molada · bildirimler sessiz". Çağrılar rozeti = aktif çağrı + hazır sipariş.
- **Test:** K3 — müşteri çağrısında rozet sayfa yenilenmeden artar; mola rozeti cihazlar arası senkron.

## C. Masalar

### GRS-009 — Masalar listesi
- **Nerede:** `WaiterTablesPage.tsx:407-585` · `GET /api/public/waiter/tables` (`waiterPublicRoutes.ts:253-331`).
- **Kurallar:**
  - Sahip = adisyondaki ilk (iptal edilmemiş) garson siparişini alan. Müşteri QR siparişleri sahip belirlemez.
  - `can_see_other_tables=false` başkasının masasını görmez; `can_edit=false` ise "görüntüleme" ve Taşı/Birleştir gizli.
  - Sıralama: çağrısı olan → dolu → sıra no. 10 sn yoklama + canlı yenileme.
- **Test:** K2, K3 — görme/düzenleme yetki kombinasyonları; ilk sipariş iptal edilince sahiplik geçişi; admin siparişi girince liste 1 sn içinde güncellenir.

### GRS-010 — Birleşik masa grup kartı
- **Nerede:** `WaiterTablesPage.tsx:255-316`.
- **Kurallar:** Taşı/Ekle `can_edit` kontrolsüz gösteriliyor; aynı gruptaki masa seçilirse 400.
- **Test:** K3.

### GRS-011 — Masa taşıma
- **Nerede:** `WaiterTablesPage.tsx:67-134` · `POST /api/public/waiter/table-operations/move` (`tableOperationsRoutes.ts:157-181`), `moveSession` (`tableOperationsService.ts:48-160`).
- **Kurallar:** `can_transfer_table` gerekir; hedef aktif ve boş olmalı (409).
- **Test:** K2, K3 — yetkisiz 403; iki garson aynı boş masaya eşzamanlı taşırsa biri 409.

### GRS-012 — Masa birleştirme
- **Nerede:** `WaiterTablesPage.tsx:147-225` · `.../merge` (`tableOperationsRoutes.ts:184-208`), `mergeSessions` (`tableOperationsService.ts:169-304`).
- **Kurallar:** `can_merge_tables` (varsayılan kapalı). Siparişler, ödemeler ve indirimler hedefe geçer. Sahiplik sessizce değişebilir.
- **Test:** K2, K3 — ödemeli A, B'ye birleşince B'de doğru kalan.

### GRS-013 — Sipariş transferi (yalnız API)
- **Nerede:** `.../transfer-orders` (`tableOperationsRoutes.ts:211-235`), `transferOrders` (`tableOperationsService.ts:312-463`).
- **Kurallar:** Farklı oturumlardan gelirse toplam hatalı düşer.
- **Test:** K2.

## D. Masa detayı

### GRS-014 — Masa detay ekranı
- **Nerede:** `WaiterTableDetailPage.tsx:36-459` · `GET /api/public/waiter/tables/:table_id` (`waiterPublicRoutes.ts:335-432`).
- **Kurallar:** Birleşik masada zincir sonu gösterilir. `can_see=false` → 403. `can_edit=false` → "Sadece görüntüleyebilirsin". Çağrılar (acil kırmızı), siparişler, notlar, "Teslim edildi · Adisyon kasada kapatılır".
- **Test:** K2, K3.

### GRS-015 — Adet artırma/azaltma (mutfak başlamadan)
- **Nerede:** `WaiterTableDetailPage.tsx:94-106, 380-401` · `PATCH /api/public/waiter/order-items/:item_id` (`waiterPublicRoutes.ts:1088-1195`).
- **Kurallar:** Yalnız `pending` ve düzenleme yetkisiyle. Azaltma sonrası mutfakta yalnız `pending` iken (aksi 409 `KITCHEN_STARTED`). **Hazır siparişte adet artırma API'de kabul ediliyor ve mutfağa bildirim gitmiyor.**
- **Test:** K2, K3 — bekleyen 3→2 → mutfak bildirimi; hazırlanan 3→2 → 409; hazır 2→3 → engellenmeli.

### GRS-016 — İptal / iade penceresi (ürün ve adet seçimli)
- **Nerede:** `WaiterTableDetailPage.tsx:108-155, 181-191, 419-427, 461-575` · `POST /orders/:id/cancel` (`waiterPublicRoutes.ts:1219-1357`), `POST /orders/:id/cancel-items` (:1377-1477), `itemCancellationService.cancelOrderItems`.
- **Kurallar:**
  - Modlar: `cancel` (bekliyor), `refund` (mutfak başladı + iade yetkisi), `refund_request` (yetki yok → admin onayı).
  - 7 sebep; "Diğer" ≥3 karakter. Tamamı seçilirse sipariş bütünüyle iptal.
  - Bekliyor = düzeltme (kayda geçmez, mutfağa `edit` bildirimi). Mutfak başladıysa kayda geçer, mutfağa `cancel` bildirimi.
  - Ödenmiş kalem 409; teslim edilmiş sipariş 403.
- **Test:** K1, K2, K3 — bekleyende 3'ten 1 → adet 2, kayıt yok; hazırlanırken + yetki → kayıt ve "İPTAL: 1× X"; hepsi seçilince sipariş iptal; "Diğer" 'ab' → 400.

### GRS-017 — Mutfak sonrası iade talebi (garson tarafı)
- **Nerede:** `waiterPublicRoutes.ts:1241-1257, 1396-1411`, `changeRequestService.ts:58-173`.
- **Kurallar:** Yetki yoksa 202 ve talep; sipariş değişmez. Aynı siparişte ikinci talep 409. Mutfağa "İPTAL TALEBİ" bildirimi. **Onaylanan talep siparişi tamamen iptal etse de adisyon otomatik kapanmıyor.**
- **Test:** K2, K3.

### GRS-018 — Bekleyen talep bantları
- **Nerede:** `WaiterTableDetailPage.tsx:320-322, 352-359, 373-377`.
- **Test:** K2, K3 — admin reddedince bant kalkar, İptal düğmesi geri gelir.

### GRS-019 — Talep sonucu bildirimi
- **Nerede:** `WaiterCallsContext.tsx:254-264`.
- **Kurallar:** Yalnız talebi açan garsona. **"MUTFAKTAN HAZIR" başlıklı yeşil bildirimde çıkıyor (yanlış etiket);** ürün iptalinde metin "ürün iade talebin".
- **Test:** K3.

### GRS-020 — Adisyonun otomatik kapanması
- **Nerede:** `maybeAutoCloseSession` (`waiterPublicRoutes.ts:41-68`).
- **Kurallar:** İptal edilmemiş sipariş kalmadıysa kapanır; **ödeme/indirim kaydına bakılmaz.**
- **Test:** K2.

## E. Menü ve sipariş alma

### GRS-021 — Menü gezinme (kategoriler, favoriler, arama)
- **Nerede:** `WaiterMenuPage.tsx:26-46, 132-168, 289-441` · `GET /api/public/waiter/menu`.
- **Kurallar:** Favoriler personel ve işletme bazında tarayıcıda.
- **Test:** K1, K3.

### GRS-022 — Sepet ve notlar
- **Nerede:** `WaiterMenuPage.tsx:170-219, 443-606`.
- **Kurallar:** Mevcut siparişe eklerken genel not gizli. Sunucu sınırları: adet 1-99, 30 satır, not 300/500.
- **Test:** K1, K3.

### GRS-023 — Siparişi gönderme (yeni ya da mevcut siparişe ekleme)
- **Nerede:** `WaiterMenuPage.tsx:96-130, 221-248, 283-287` · `POST /tables/:id/orders` (:801-946), `POST /orders/:id/items` (:958-1080).
- **Kurallar:**
  - Bekleyen sipariş varsa ona eklenir ("Siparişe Ekle"), yoksa yeni sipariş ("Mutfağa Gönder").
  - Mutfak başladıysa ekleme 409 `KITCHEN_STARTED`; **otomatik yeni siparişe geçmiyor.**
  - Pasif ürün sessizce atlanır; 0 kalemli sipariş oluşabilir.
  - Sahiplik kontrolü transaction dışında (eşzamanlı ilk sipariş riski).
- **Test:** K2, K3.

## F. Çağrılar, hazır siparişler, canlı akış

### GRS-024 — Çağrılar ve "İlgilendim"
- **Nerede:** `WaiterCallsPage.tsx`, `WaiterCallsContext.tsx:153-168` · `GET /calls`, `POST /calls/:id/take` (:468-563).
- **Kurallar:** Kuyruk işletme genelinde ortak. Kilitli alma; ikinci garson 409. 409 tespiti Türkçe metin eşleşmesiyle (kırılgan).
- **Test:** K2, K3 — iki garson aynı anda → biri 200, biri 409; A alınca B'de kart 1 sn içinde kaybolur.

### GRS-025 — Hazır siparişler ve "Teslim Edildi"
- **Nerede:** `WaiterCallsPage.tsx:75-137` · `GET /ready-orders`, `POST /orders/:id/deliver` (:607-708).
- **Kurallar:** Yalnız `ready` teslim edilir; teslimde adisyon tutarı artar. Görme yetkisi kontrolü yok.
- **Test:** K2, K3.

### GRS-026 — Canlı akış (SSE), yedek yoklama
- **Nerede:** `WaiterCallsContext.tsx:195-374` · `GET /api/public/waiter/stream` (:714-758).
- **Kurallar:** Olaylar: `call`, `call_taken`, `kitchen_order_ready`, `order_status`, `order_cancelled`, `change_request`, `staff_update`. **401/429/5xx'te akış kalıcı kapanıyor, yeniden bağlanma yok.** Token adres satırında taşınıyor.
- **Test:** K1, K2, K3 — Wi-Fi 20 sn kesilince kaçan çağrı görünür.

### GRS-027 — Mutfak hazır bildirimleri ve sesler
- **Nerede:** `components/KitchenReadyToasts.tsx`, `WaiterCallsContext.tsx:36-46, 86-132, 277-290`.
- **Kurallar:** Molada ses ve bildirim yok. **Çağrı sesi askıya alınmış ses bağlamını açmıyor (mobilde sessiz kalabilir).**
- **Test:** K1, K3.

## G. Profil, mola, vardiya

### GRS-028 — Profil (kimlik, vardiya, yetkilerim)
- **Nerede:** `WaiterProfilePage.tsx:33-210` · `GET /api/public/waiter/profile`.
- **Test:** K2, K3.

### GRS-029 — Mola başlat / bitir
- **Nerede:** `WaiterProfilePage.tsx:58-91, 151-189` · `POST /break/start`, `/break/end`, `staffService.ts:65-130`.
- **Kurallar:** Yetki yoksa 403; süreler 5-60 dk; zaten moladaysa 409; süre dolunca otomatik bitmez.
- **Test:** K2, K3 — iki cihazda mola senkronu.

## H. Yetki modeli

### GRS-030 — Yetkiler ve masa sahipliği
- **Nerede:** `services/staffPermissions.ts:1-64`, `waiterService.ts:15-48`.
- **Kurallar:** Varsayılanlar: iade kapalı, görme açık, başkasınınkini düzenleme kapalı, taşıma açık, birleştirme kapalı, mola açık. **Eski kayıtlarda düzenleme yetkisi yoksa true sayılıyor (yeni personelde false — tutarsız).** Çağrı alma ve teslimde yetki kontrolü yok.
- **Test:** K1 (doğruluk tablosu) + K2 (matris: 6 yetki × kendi/başkası/sahipsiz masa × bekliyor/hazırlanıyor/hazır/teslim).

### GRS-031 — Admin işlemlerinin garson uygulamasına etkisi
- **Nerede:** `waiterService.ts:285-482`.
- **Test:** K2, K3 — yeni QR üretilince eski cihaz "Giriş linkin yenilendi…" ile çıkar.

---

## Riskli alanlar / olası regresyonlar
1. Paylaşılan `tab_id` ile sekmenin düşmesi; exchange tek transaction'da değil.
2. `loginWithToken` diğer personelin cihaz kaydını silebiliyor.
3. `crypto.randomUUID` güvenli olmayan bağlamda yok.
4. `X-Tab-ID` gönderilmezse sekme bağlama atlatılıyor.
5. Logout kimliksiz; sekme kapanınca `shift_end` oluşmuyor.
6. SSE kalıcı kapanma; bağlantı sırasında oturum süresi yeniden kontrol edilmiyor.
7. Masa taşıma/birleştirme istemcisi 401'i yayınlamıyor.
8. Yetkiler giriş anındaki kopyadan okunuyor (admin değiştirince F5'e kadar düğmeler yanlış).
9. Birleşik grup kartında yetki kontrolsüz düğmeler; birleşmiş kaynak satırlar herkese düzenlenebilir.
10. Sahiplik kayması (birleştirme, ilk sipariş iptali, eşzamanlı ilk sipariş).
11. 0 kalemli sipariş.
12. Menüde eski açık sipariş bilgisi; mutfak başlarsa yeni siparişe geçilmiyor.
13. Hazır siparişte adet artırma ve bildirimsizlik; ölü kod (`r.pending`, `requestItemDecrease`).
14. Onaylanan ürün iptali adisyonu kapatmıyor.
15. Çağrı alma ve teslimde yetki kontrolü yok.
16. Kırılgan 409 tespiti (metin eşleşmesi).
17. Talep sonucu bildirimi yanlış etiketli.
18. Mobilde çağrı sesi sessiz kalabilir.
19. E-posta girişi işlevsiz; 429 "Bağlantı hatası" görünüyor.
20. Kimliği doğrulanmış garson uçlarında rate limit yok.
21. Yetki normalizasyonu tutarsız.
22. Performans: her masa kartında ayrı saniyelik sayaç + yoklama + her olayda tam yenileme.

**Önerilen ilk test paketi:** çoklu sekme/cihaz oturum (K3) · yetki × mutfak durumu matrisi (K2) · iptal/iade/talep akışı (K2) · eşzamanlı çağrı alma ve teslim yarışları (K2).

# 01 — Müşteri (QR menü) ve tanıtım sayfaları

> Özellik kataloğu · bölüm 1/5. Her özelliğin numarası testlerde ve hata kayıtlarında referans olarak kullanılır.
> Test katmanları: **K1** birim/hesaplama · **K2** API akış testi (gerçek veritabanı) · **K3** tarayıcı (E2E).
> Kısaltmalar: **PMP** `apps/web/src/pages/PublicMenuPage.tsx` · **PR** `apps/api/src/routes/publicRoutes.ts` ·
> **COR** `apps/api/src/routes/customerOrderRoutes.ts` · **MOT** `apps/web/src/components/MyOrdersTab.tsx`.
> Rotalar: web `/m/:slug`, masa linki `/m/:slug?masa=<tableUUID>`, sekme `&tab=orders`. API `/api/public` altında.

Kapsam notları:
- `customer_can_view_bill` ayarı **uygulanmıyor** (yalnızca kaydediliyor).
- `is_accepting_orders` ("Sipariş alımı") **uygulanmıyor** (yalnızca kaydediliyor).
- Müşteri tarafında canlı bağlantı yok; Siparişlerim 30 sn'de bir yenileniyor.
- Stok/tükendi, alerjen, dil seçimi yok; müsaitlik yalnızca `is_active`. PWA/service worker yok.

---

## A. Menü yükleme, sayfa durumları ve önbellek

### MUS-001 — Menü yükleniyor ekranı
- **Ne görülür:** Dönen çember ve "Menü yükleniyor...".
- **Nerede:** PMP:232-244, PMP:470-477 · `GET /api/public/menu/:slug` (PR:68-81).
- **Kurallar:** Slug 1-120 karakter (aksi 400). Slug değişince yeniden yüklenir, ilk kategori aktif olur.
- **Mevcut test:** yok · **Test:** K3 — yavaş ağda yükleme ekranı görünür, menü gelince kaybolur.

### MUS-002 — "Menü Bulunamadı" ekranı
- **Ne görülür:** Bilinmeyen/pasif slug'da "Menü Bulunamadı".
- **Nerede:** PMP:479-487 · PR:73-76 (404) · `menuService.ts:59`.
- **Kurallar:** Her hata (404, 429, 500, ağ) aynı ekranı gösterir — 429 da "bulunamadı" görünür. Süper admin pasifleştirmesi önbelleği temizlemez (60-120 sn görünmeye devam eder).
- **Mevcut test:** `publicMenuCache.test.ts` (dolaylı, mock) · **Test:** K2+K3 — bilinmeyen slug → 404; pasif işletme → 404; 61. istekte 429 → UI "bulunamadı" (regresyon kaydı).

### MUS-003 — Herkese açık menü verisi
- **Ne görülür:** İşletme bilgileri, aktif kategoriler ve sıralı aktif ürünler.
- **Nerede:** `menuService.ts:47-127` · tipler `packages/shared/src/types.ts:78-113`.
- **Kurallar:** Yalnız `is_active`, `sort_order ASC`. Pasif kategorideki ürün görünmez. Ad/açıklama `sanitizeText` ile temizlenir. `price_int` kuruş. Varsayılan `theme_color` `#0D9488`. `wifi_password` herkese açık (tasarım gereği). `bg_color`/`dark_mode` dönüyor ama UI kullanmıyor.
- **Mevcut test:** `publicMenuCache.test.ts` (mock) · **Test:** K1+K2 — pasif ürün/kategori yok; sıra korunur; `<b>Latte</b>` → "Latte"; A işletmesi slug'ı B'nin ürünlerini döndürmez.

### MUS-004 — Menü önbelleği (Redis `menu:{slug}`)
- **Ne yapar:** 60-120 sn rastgele süreli önbellek; yönetici değişikliğinde temizlenir.
- **Nerede:** `menuService.ts:43-52, :125, :129-131` · temizleme `adminRoutes.ts` :254, :378, :402, :442, :528, :582, :606.
- **Kurallar:** Kategori **ekleme** (`adminRoutes.ts:318`), süper admin pasifleştirme ve eski slug önbelleği temizlemiyor.
- **Mevcut test:** `publicMenuCache.test.ts` · **Test:** K1+K2 — ikinci çağrıda DB sorgusu yok; ürün güncelleme sonrası yeni fiyat; kategori silme sonrası kaybolur; TTL 60-120.

### MUS-005 — Sekmeye dönünce sessiz menü yenileme
- **Nerede:** PMP:248-266.
- **Kurallar:** En fazla 15 sn'de bir. Seçili kategori silindiyse ilk kategoriye geçer. **Sepetteki fiyat güncellenmez.**
- **Test:** K3 — fiyat değişince kart yeni fiyatı gösterir; sepet korunur.

### MUS-006 — Menü rate limit'i (`publicMenuRateLimit`)
- **Ne yapar:** IP başına dakikada 60 istek.
- **Nerede:** `rateLimit.ts:64-68` · kullanım PR:68, COR:27, COR:64 — **üçü aynı kovayı paylaşıyor.**
- **Kurallar:** Reddedilen istek de sayılır. Aynı Wi-Fi'deki müşteriler aynı kovayı paylaşır.
- **Test:** K2 — 60 istek 200, 61. → 429; 60 sn sonra tekrar 200; farklı IP etkilenmez.

## B. Menü gösterimi ve gezinme

### MUS-007 — İşletme başlığı (logo, ad, açıklama)
- **Nerede:** PMP:509-537, `BusinessDescription` PMP:96-121.
- **Kurallar:** Açıklama 2 satırı aşarsa "Devamını oku / Daha az".
- **Test:** K3 — logo yoksa yer tutucu; uzun açıklamada düğme var, kısada yok.

### MUS-008 — Masa etiketi ("Masa X")
- **Nerede:** PMP:268-280, :526-534 · `GET /api/public/table/:slug/:table_id` (COR:27-55).
- **Kurallar:** `table_id` UUID olmalı (400), işletme ve masa aktif olmalı (404). **Geçersiz masada rozet çıkmaz ama sepet ve Garson Çağır görünür.**
- **Test:** K2+K3 — geçerli masa 200; başka işletmenin masası 404; UUID değil 400; pasif masa 404.

### MUS-009 — Gece/gündüz modu
- **Nerede:** PMP:535, `ThemeToggle.tsx`, `lib/theme.ts:39-101`, `index.html`.
- **Kurallar:** Kayıtlı tercih > sistem ayarı; sekmeler arası senkron; işletmenin `dark_mode` alanı yok sayılır.
- **Test:** K3 (+K1) — tercih yenilemede korunur; ikinci sekme güncellenir.

### MUS-010 — İşletme rengi uygulaması
- **Nerede:** PMP:285, `lib/businessTheme.ts:14-42`, `lib/color.ts`.
- **Kurallar:** Geçersiz hex yok sayılır; kontrast her tema için otomatik ayarlanır; sayfadan çıkınca değişkenler kaldırılır.
- **Test:** K1+K3 — beyaz renk açık temada okunur renge çevrilir; geçersiz renkte değişken set edilmez.

### MUS-011 — Kategori gezinmesi
- **Nerede:** PMP:559-571 (masaüstü), :589-602 (mobil), :287-290.
- **Test:** K3 — hap seçimi başlığı ve ürün sayısını değiştirir; arama doluyken haplar gizli.

### MUS-012 — Menüde arama
- **Nerede:** PMP:575-586, filtre :293-300.
- **Kurallar:** Türkçe küçük harf, ad ve açıklamada arar.
- **Test:** K1+K3 — "İSKENDER" → "iskender" bulunur; eşleşme yoksa boş durum.

### MUS-013 — Bölüm başlığı, ürün sayacı, boş kategori
- **Nerede:** PMP:605-622 · **Test:** K3.

### MUS-014 — Ürün kartı
- **Nerede:** PMP:624-691, `formatPrice` PMP:69-71.
- **Kurallar:** Masasız: karta dokunma detay açar. Masalı: karta dokunma sepete ekler, (i) detay açar.
- **Test:** K1 (`formatPrice(1250)` = "12.50 TL") + K3.

### MUS-015 — Ürün detay penceresi
- **Nerede:** PMP:740-774 · **Test:** K3 — "Sepete Ekle" sonrası pencere kapanır, sayaç +1; masasızda buton yok.

### MUS-016 — İşletme bilgi kartı (Wi-Fi, iletişim)
- **Nerede:** PMP:124-188, `whatsappDigits` :74-80, `instagramLink` :83-93, `lib/clipboard.ts`.
- **Kurallar:** Bilgi yoksa kart çizilmez; "0555…" → "90555…"; kopyalama HTTPS dışında yedek yönteme düşer.
- **Test:** K1+K3 — `whatsappDigits('0555 123 45 67')` = '905551234567'; Kopyala → "Kopyalandı".

### MUS-017 — "Powered by AtlasQR" alt bilgisi
- **Nerede:** PMP:699-705 · **Test:** K3 — yalnız masasız açılışta görünür.

## C. Sepet ve sipariş

### MUS-018 — Alt bar: "Garson Çağır" + "Sepetim"
- **Nerede:** PMP:709-737 · **Test:** K3 — masasızda yok; 2 ürün → "2 ürün • X TL"; Siparişlerim'de gizli.

### MUS-019 — Sepete ekleme / artırma / azaltma / çıkarma
- **Nerede:** PMP:306-335, :640-679, :817-823.
- **Kurallar:** Aynı ürün tek satır. İstemcide adet sınırı yok, API 99'u aşanı reddeder. Sepet kalıcı değil.
- **Test:** K1+K3 — 3 kez basınca adet 3; adet 1'de "−" satırı siler; adet 100 → API 400.

### MUS-020 — Sepet penceresi
- **Nerede:** PMP:777-896 · **Test:** K3 — boş sepette gönder yok; 2×12.50 + 1×10 → "35.00 TL".

### MUS-021 — Ürüne özel not (hazır şablonlar)
- **Nerede:** PMP:826-859, `OrderNoteTemplates.tsx` (`appendTemplate` :153-163).
- **Kurallar:** Aynı şablon iki kez eklenmez; not ≤300 karakter (API); boş not NULL.
- **Test:** K1 (`appendTemplate`) + K2 (301 karakter → 400) + K3.

### MUS-022 — Sipariş geneli not
- **Nerede:** PMP:866-879 · **Kurallar:** ≤500 karakter, trim'lenmiyor · **Test:** K2.

### MUS-023 — Siparişi gönder
- **Nerede:** PMP:343-378 · `POST /api/public/order/:slug` (PR:102-226).
- **Kurallar:**
  - En fazla 20 satır, adet 1-99; hatada tek genel mesaj "Geçersiz sipariş verisi."
  - Pasif işletme / masa → 404.
  - Adisyon çözülür ya da açılır (birleşik masa zinciri, kilit, yeniden deneme).
  - **Fiyat ve ad veritabanından alınır.** Pasif ürün sessizce atlanır; **0 kalemli sipariş oluşabilir.**
  - Sonrasında `new_order` canlı olayı yayınlanır.
- **Test:** K2 (öncelikli) + K3 — 2 ürünle 201 ve DB fiyatıyla kayıt; ikinci sipariş aynı adisyona; birleşik masada hedef adisyona; 21 satır → 400; eşzamanlı 2 sipariş → tek adisyon.

### MUS-024 — Sipariş rate limit'i
- **Ne yapar:** IP + masa başına dakikada 10 sipariş (`rateLimit.ts:71-76`).
- **Test:** K2 — 11. sipariş 429; farklı masa ya da IP etkilenmez.

### MUS-025 — `/order` ile `type:'call'` (eski yol)
- **Kurallar:** Tekilleştirme, çağrı limiti ve log yok; UI kullanmıyor. Kasıtlı mı karar verilmeli.
- **Test:** K2.

## D. Masa kimliği ve müşteri oturumu

### MUS-026 — QR ile masa tanıma (`?masa=`)
- **Kurallar:** Masa kimliği yalnız tahmin edilemez UUID; ek imza yok. Masasız sayfa "vitrin menü" olur.
- **Test:** K2+K3 — masasız URL'de sepet/çağrı/sekme yok; pasif masada sipariş 404.

### MUS-027 — Müşteri cihaz kimliği (`customer_token`)
- **Nerede:** `utils/customerToken.ts:24-37` · PR:26, :165 · COR:112.
- **Kurallar:** Tarayıcıda saklanan UUID; "benim siparişim" ayrımı buna göre. Kimlik doğrulama değildir.
- **Test:** K1+K2 — token A'nın siparişi token A ile `is_mine=true`, B ile `false`.

### MUS-028 — Masa adisyonu oluşumu ve birleşik masa
- **Nerede:** `sessionService.ts:40-55` (`followMergeChain`), :84-104, :115-158.
- **Test:** K1+K2 — A(merged→B) → B; döngü → null; birleşik masadan sipariş hedef adisyona yazılır.

## E. Garson çağırma

### MUS-029 — "Garson Çağır" penceresi (12 tür)
- **Türler:** Garson, Su, **Hesap**, Paket, Mama Sandalyesi, Şarj, Küllük, Çakmak, Sigara, Masa Silinsin (acil), Servis Eksik (acil), Diğer.
- **Nerede:** PMP:899-1028 · `lib/callTypes.ts:25-38` · API listesi PR:35-55.
- **Kurallar:** Tür seçmeden gönderilemez; son 15 dk'da iletilmiş türde ✓ görünür.
- **Test:** K1 (web ve API tür listeleri birebir aynı — sözleşme testi) + K3.

### MUS-030 — "Diğer" ve zorunlu açıklama
- **Kurallar:** En az 3, en fazla 500 karakter.
- **Test:** K2+K3 — `note:'ab'` → 400; `'   abc '` → kayıt "abc".

### MUS-031 — Çağrı gönderme ve aynı tür tekilleştirme
- **Nerede:** PMP:424-468 · `POST /api/public/call/:slug` (PR:232-363).
- **Kurallar:** Aynı masada aynı türde bekleyen çağrı varsa yeni kayıt açılmaz, "zaten haberdar edildi" döner. Farklı tür ayrı kayıt. Masa satırı kilitlenir (çift tıklamada tek kayıt). Yeni kayıtta aktivite logu ve `call` canlı olayı.
- **Test:** K2 (öncelikli) — ikinci "water" → `alreadyCalled`, tek kayıt; "water" beklerken "bill" → 2 kayıt; eşzamanlı 5 istek → tek kayıt.

### MUS-032 — "Garsonunuz haberdar edildi" ekranı
- **Nerede:** PMP:931-959, saklama PMP:43-62 (15 dk).
- **Kurallar:** Yenilemede kendiliğinden açılır; "Tamam" sonrası açılmaz. **Garsonun çağrıyı karşılaması müşteriye yansımaz.**
- **Test:** K1+K3.

### MUS-033 — Çağrı rate limit'i
- **Ne yapar:** IP + masa başına dakikada 10 (`rateLimit.ts:94-99`); tekilleştirilen istekler de sayılır.
- **Test:** K2 — 11. çağrı 429.

### MUS-034 — Çağrı türü rozeti / etiketleri
- **Nerede:** `CallTypeBadge.tsx`, `lib/callTypes.ts:40-48`.
- **Test:** K1 — `getCallType(null).label` = 'Garson Çağrısı'; bilinmeyen kod → kodun kendisi.

## F. Siparişlerim / masa adisyonu

### MUS-035 — "Menü / Siparişlerim" sekmeleri
- **Nerede:** PMP:201-210, :540-555 · **Test:** K3 — `?tab=orders` yenilemede korunur.

### MUS-036 — Masa adisyonu görünümü
- **Nerede:** MOT:71-244 · `GET /api/public/sessions/:sessionId/bill` (COR:64-141).
- **Kurallar:** Masadaki tüm kalemler; kendi kalemleri normal, başkalarınınki soluk. İptal edilen üstü çizili. Kapalı adisyon 404 ("henüz sipariş yok" gibi görünür). **`customer_can_view_bill=false` olsa da gösterilir.**
- **Test:** K2 (öncelikli) + K3 — `is_mine` doğruluğu; iptal kalem toplama girmez; kapalı adisyon 404; başka işletmenin adisyonu sızmaz.

### MUS-037 — Toplam / Ödenen / Kalan kutusu
- **Nerede:** MOT:225-241, COR:126-139 · **Test:** K1+K2.

### MUS-038 — Otomatik yenileme (30 sn) ve "Yenile"
- **Nerede:** MOT:17, :104-131.
- **Kurallar:** Canlı olay yok; her döngü menü limit kovasından 2 istek harcar.
- **Test:** K3 — mutfak "Hazırlanıyor" yapınca ≤30 sn içinde rozet değişir; API kapalıyken "Bağlantı sorunu".

### MUS-039 — Adisyon boş / yükleniyor durumları
- **Nerede:** MOT:133-154 · **Test:** K3.

## G. Diğer

### MUS-040 — `GET /api/public/qr/:slug` (HTML link sayfası)
- **Nerede:** PR:83-99.
- **Kurallar:** **Link `/menu/{slug}` üretiyor, web rotası `/m/:slug`** (yanlış). Slug kaçışsız yazılıyor; rate limit yok.
- **Test:** K2 — link `/m/{slug}` içermeli (şu an başarısız olur).

---

## Tanıtım sayfaları

### TAN-001 — Üst gezinme (PublicHeader)
- **Nerede:** `components/PublicHeader.tsx:13-148`.
- **Kurallar:** Aktif bağlantı vurgusu hiç çalışmıyor (`isActive` karşılaştırması :17-23).
- **Test:** K3.

### TAN-002 — Ana sayfa (`/`)
- **Kurallar:** WhatsApp CTA'ları, Özellikler ve Destek bölümleri, SSS. Bilinmeyen rotalar buraya yönlenir.
- **Test:** K3 — `/#destek` bölüme kayar; `/olmayan` → `/`.

### TAN-003 — Fiyatlandırma (`/fiyat`)
- **Kurallar:** 4 plan. **"Aylığa göre 4.500 ₺ kazanç" metni hesapla tutmuyor** (3.000 ya da kurulum dahil 5.000 olmalı).
- **Test:** K3.

---

## Riskli alanlar / olası regresyonlar
1. `customer_can_view_bill` uygulanmıyor (COR:64-141, MOT).
2. `is_accepting_orders` uygulanmıyor (PR:102, PR:232).
3. Ortak rate limit kovası: menü, masa ve adisyon IP başına 60/dk tek kova; aynı Wi-Fi'de Siparişlerim açık 8 müşteri yeni gelenlerin menüyü açmasını engelleyebilir; 429 "Menü Bulunamadı" görünür.
4. QR HTML linki yanlış (`/menu/` yerine `/m/`), slug kaçışsız.
5. Boş ya da kısmi sipariş sessizce kabul ediliyor (pasif ürün atlanır, 0 kalemli sipariş açılabilir).
6. `/order` ile `type:'call'` kapısı açık.
7. İstemci ve sunucu limitleri uyuşmuyor (20 satır, 99 adet, not uzunlukları).
8. Sepet fiyatı bayatlayabilir.
9. Önbellek temizleme boşlukları (kategori ekleme, süper admin pasifleştirme, eski slug).
10. Geçersiz masa linkinde sipariş arayüzü görünüyor.
11. Çift gönderime karşı yalnız buton kilidi (idempotency yok).
12. Çağrı durumu müşteriye yansımıyor.
13. Çağrı tür listesi iki yerde kopya.
14. Kapalı adisyon ve ağ hatası ayrımı yok.
15. Masa UUID'si bilinirse adisyonun tamamı okunabilir.
16. Sepet kalıcı değil; `removeFromCart` eski state okuyor.
17. Herkese açık akışlar için test yok denecek kadar az.

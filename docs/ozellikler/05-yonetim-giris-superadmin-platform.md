# 05 — Yönetim paneli, giriş, işletme sahibi, süper admin, hata kayıtları, altyapı

> Özellik kataloğu · bölüm 5/5. **Not:** Bu bölümde test önerilerinin yanındaki "Öncelik 1/2/3" etiketi test katmanı değil, **önceliktir**: 1 = güvenlik/yetki/para/veri bütünlüğü (her gönderimde), 2 = ana iş akışı, 3 = arayüz/kozmetik. Önerilen senaryoların katmanı (K1 birim · K2 API akış · K3 tarayıcı) senaryonun içeriğinden anlaşılır.
> Kısaltmalar: `api/` = `apps/api/src/`, `web/` = `apps/web/src/`.

**Mevcut test altyapısı:**
- Testler `api/test/` altında, vitest ile koşuyor. Ayar dosyası: `apps/api/vitest.config.ts`.
- Testler yalnızca mock DB/Redis ile çalışıyor.
- `.github/workflows/ci.yml` sırası: tip kontrolü → boş Postgres'te migration → `pnpm -C apps/api test` → web build.
- Web tarafında test yok.

---

## A) YÖNETİM PANELİ KABUĞU ve İÇERİK

### PNL — Panel / Kabuk / Dashboard

**PNL-01 Kenar menü ve gezinme**
- **Açıklama:** Admin kabuğu. Panel, Siparişler, Ödemeler (Kasa, altın renk), Masalar, Kategoriler, Ürünler, Personel, Mutfak, Ayarlar ve QR Kod sekmeleri. Başlıkta aktif sekmenin adı görünür.
- **Nerede:**
  - `web/components/Layout.tsx:82-133`, aktiflik kontrolü `:128-131`
  - `web/App.tsx:95-118`: `RequireAuth` → `RedirectOwnerToOwnerPanel` → `OrderProvider` → `AdminLayout`
- **Kurallar:**
  - `/admin` için tam eşleşme gerekir. Diğer sekmeler `startsWith` ile eşleşir.
  - Owner `/owner`'a yönlendirilir (`App.tsx:56-60`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given admin girişi, When `/admin/products` açılır, Then "Ürünler" sekmesi `aria-current=page` olur ve başlıkta "Ürünler" yazar.
  2. Given owner rolü, When `/admin` açılır, Then `/owner`'a yönlendirilir.
  3. Given oturum yok, When `/admin/settings` açılır, Then `/login`'e gider.

**PNL-02 Modül bayrakları (waiter / kitchen)**
- **Açıklama:** Personel ve Mutfak sekmeleri yalnızca süper admin modülü açtıysa görünür. Pencere odağa her döndüğünde bayraklar yeniden okunur.
- **Nerede:**
  - `Layout.tsx:27-47` (`useModuleFlags` → GET `/api/admin/business`), filtre `:126`, doğrudan URL engeli `:136-139`
  - API: `api/routes/adminRoutes.ts:180-196`, alanlar `:127-130`
- **Kurallar:**
  - Bayrak bilinmiyorken (`null`) modüllü sekmeler gizli kalır.
  - Modül kapalıyken `/admin/waiters` ya da `/admin/kitchen` açılırsa `<Navigate to="/admin">` çalışır.
  - Sunucu tarafı: `createWaiter` `waiter_module_enabled` kontrol eder (`api/services/waiterService.ts:125-136`), sonuç 403 "Personel modülü bu işletme için kapalı." (`waiterAdminRoutes.ts:120-121`).
  - Personel listeleme ve güncellemede sunucu modül kontrolü YOK.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given `waiter_module_enabled=false`, When POST `/api/admin/waiters`, Then 403.
  2. Given modül kapalı, When `/admin/waiters` URL'si açılır, Then `/admin`'e yönlenir.
  3. Given modül açık ve sonra kapatıldı, When pencere focus olur, Then Personel sekmesi kaybolur.
  4. Given `kitchen_module_enabled=true`, Then Mutfak sekmesi görünür.

**PNL-03 Rozetler ve başlık durum çipleri**
- **Açıklama:** Siparişler sekmesinde bekleyen sayısı rozeti (9'dan fazlası "9+"). Başlıkta "N sipariş" ve "N çağrı" çipleri; ikisi de yoksa "Aktif" çipi.
- **Nerede:**
  - `Layout.tsx:180-185`, `:235-255`
  - Sayaçlar: `web/context/OrderContext.tsx:510-511`
- **Kurallar:**
  - `pendingCount`, type'a bakmadan bütün `pending` kayıtları sayıyor; çağrılar da buna dahil.
  - Bu yüzden çağrılar hem "sipariş" hem "çağrı" çipinde sayılıyor (aşağıdaki riskler listesine bakın).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given 2 bekleyen sipariş ve 1 bekleyen çağrı, Then sipariş çipi 2, çağrı çipi 1 göstermeli. Şu an 3 ve 1 gösteriyor; bu senaryo hatayı yakalar.
  2. Given 12 bekleyen, Then rozette "9+" yazar.
  3. Given hiçbir şey yok, Then "Aktif" çipi görünür.

**PNL-04 Başlık saati**
- **Açıklama:** Tarih ve saat dakika dönümüne hizalı güncellenir. Telefonda gizli, tablette yalnızca saat görünür.
- **Nerede:** `Layout.tsx:50-70`
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):** Given saat 10:00:59, When 1 sn geçer, Then 10:01 gösterilir (fake timers).

**PNL-05 Gece/gündüz teması**
- **Açıklama:** `ThemeToggle` ile değiştirilir. Kaydedilmiş tercih (localStorage `atlasqr:theme`) sistem ayarından önce gelir. Sekmeler arasında `storage` olayıyla eşitlenir.
- **Nerede:** `web/lib/theme.ts:9-88`, `web/components/ThemeToggle.tsx`, `Layout.tsx:256`; sayfa zemini için `useThemedPage` (`theme.ts:94-106`)
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):**
  1. Given tercih yok ve sistem dark, Then `data-theme=dark`.
  2. Given toggle tıklanır, Then localStorage güncellenir ve `meta[theme-color]` değişir.
  3. Given başka sekmede tema değişir, Then bu sekmede de uygulanır.

**PNL-06 Mobil kenar menü**
- **Açıklama:** Hamburger düğmesi menüyü açar. Scrim'e ya da bir bağlantıya tıklanınca kapanır.
- **Nerede:** `Layout.tsx:210-218`, `:225-228`, link `onClick` `:169`
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):** Given 375px genişlik, When menü açılıp bir linke tıklanır, Then menü kapanır ve rota değişir.

**PNL-07 Çıkış (admin)**
- **Açıklama:** Yalnızca istemci tarafında token'ları siler.
- **Nerede:** `Layout.tsx:192`, `web/auth/AuthContext.tsx:137-144`
- **Kurallar:** Sunucuda logout endpoint'i YOK. Refresh token geçerliliğini korur.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):** Given çıkış yapıldı, When eski refresh_token ile POST `/api/auth/refresh`, Then şu an 200 dönüyor. Beklenen davranış 401; sunucu tarafı logout eklenince bu test anlam kazanır.

**PNL-08 Panel ölçüm kartları**
- **Açıklama:** Açık masa, aktif sipariş, geciken ve bekleyen çağrı sayıları.
- **Nerede:**
  - `web/pages/AdminDashboardPage.tsx:178-183`, `:221-234`
  - Açık masa sayısı: GET `/api/admin/sessions` (`:129-138`, sipariş değişince ve 30 sn'de bir); masa sayısı `table_id` tekilleştirilerek bulunur.
- **Kurallar:**
  - Geciken: `minutesSince(created_at) >= late_after_minutes`.
  - Eşik ayardan gelir, varsayılan 15 (`:27`, `:110`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given `late_after_minutes=10` ve 12 dk önceki sipariş, Then "Geciken"=1 ve kırmızı.
  2. Given aynı masada 2 oturum (merged), Then açık masa 1.
  3. Given SSE ile yeni sipariş gelir, Then "Aktif sipariş" anında artar.

**PNL-09 Aktif siparişler tablosu ve detay modalı**
- **Açıklama:** pending, preparing ve ready siparişler eski olandan yeniye sıralanır. Süre canlı akar (15 sn tick). "Gecikiyor" satırı vurgulanır. Detay modalında kalemler, notlar ve toplam görünür.
- **Nerede:** `AdminDashboardPage.tsx:120-126`, `:245-285`, `:425-489`
- **Kurallar:** Modal ESC ile kapanır. Toplam `quantity * price_int` ile hesaplanır.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given ready sipariş, Then "Servise hazır" rozeti.
  2. Given kalem notu var, Then modalda "Not:" görünür.
  3. Given 2×1500 kuruş, Then toplam "30.00 TL".

**PNL-10 "Dikkat gerektirenler" listesi**
- **Açıklama:** Onay bekleyen talep, geciken sipariş, çağrı, 5 dk'dır başlatılmamış sipariş, mola süresi aşanlar, vardiyası 15 dk içinde bitenler ve satışa kapalı ürünler.
- **Nerede:** `AdminDashboardPage.tsx:185-206`, `:312-335`
- **Kurallar:**
  - Sayısı 0 olan maddeler gizlenir. Hiçbir şey yoksa sağ sütun çizilmez.
  - Personel maddeleri yalnızca `staffEnabled` iken görünür.
  - Satışa kapalı ürün sayısı yalnızca ilk 100 ürün üzerinden hesaplanır (`:115-116`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given molası 5 dk önce bitmiş personel, Then "Mola süresi aşıldı" ve isim görünür.
  2. Given hiçbir koşul yok, Then sağ sütun render edilmez.
  3. Given 120 ürün ve bunlardan 101.'si pasif, Then sayı eksik çıkar (bilinen hata).

**PNL-11 Onay bekleyen talepler (iade, adet azaltma, ürün iptali)**
- **Açıklama:** Yetkisiz personelin talepleri Panel'de onaylanır ya da reddedilir.
- **Nerede:**
  - UI: `AdminDashboardPage.tsx:91-97`, `:292-309`; `web/lib/changeRequests.ts:61-97`; `web/components/ChangeRequestItem.tsx`
  - API: GET `/api/admin/change-requests`, POST `/:id/approve`, POST `/:id/reject` (`api/routes/changeRequestRoutes.ts:18-52`)
- **Kurallar:**
  - Yalnızca admin.
  - SSE `change_request` olayı ya da 30 sn'lik yoklama listeyi tazeler.
  - Sonuç durumları: approved, rejected ya da "sipariş değiştiği için geçersiz".
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given başka işletmenin talep id'si, When approve, Then 404 ya da 403 ve hiçbir değişiklik yok.
  2. Given `order_cancel` talebi, When approve, Then sipariş cancelled ve mesaj "İade onaylandı…".
  3. Given talep sırasında sipariş değişti, Then "geçersiz sayıldı".
  4. Given note 301 karakter, Then 400.

**PNL-12 Personel hareketleri akışı (canlı)**
- **Açıklama:** Son 24 saatteki en fazla 30 hareket: break_start, break_end, shift_start, shift_end. Gecikme dakikası gösterilir.
- **Nerede:**
  - UI: `AdminDashboardPage.tsx:140-151`, `:338-378`
  - API: GET `/api/admin/waiters/overview` (`api/routes/waiterAdminRoutes.ts:133-140`) → `api/services/staffService.ts:150-185`
  - Olaylar: `staffService.ts:83-90`, `:121-128`, `:141-146` (`publishOrder` → `staff_update`) → `OrderContext.tsx:368-370` (`atlasqr:staff-update`)
- **Kurallar:**
  - `created_at` timestamptz'e çevrilir (`:166-167`).
  - Akış yalnızca personel modülü açıkken çalışır.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given personel molaya çıkar, Then SSE ile 1 sn içinde Hareketler'de "molaya çıktı (15 dk)" görünür.
  2. Given 25 saat önceki hareket, Then listede yok.
  3. Given B işletmesinin hareketi, Then A'nın overview'unda yok.

**PNL-13 Alt kısayol çubuğu ve serviste/molada sayacı**
- **Açıklama:** Ürün ekle (`?yeni=1`), Masa ekle, Personel ekle (modül açıksa), Menüyü aç. Serviste ve molada sayıları.
- **Nerede:** `AdminDashboardPage.tsx:168-173`, `:208-212`, `:384-418`
- **Kurallar:** "Serviste" sayılması için `shift_ends_at` dolu olmalı. Bunun için personelin aktif oturumu ve açık sekmesi olmalı (`staffService.ts:151-161`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):**
  1. Given link üretildi ama personel giriş yapmadı, Then "0 serviste".
  2. Given giriş yaptı, Then "1 serviste".
  3. Given molada, Then "1 molada" ve "0 serviste".

**PNL-14 Ortak bileşen: Toast**
- **Açıklama:** Sağ üstte 2,4 sn görünen bildirim.
- **Nerede:** `web/components/Toast.tsx:34-114`
- **Kurallar:** Ardışık çağrılarda ilk zamanlayıcı yeni toast'ı erken siler (`:112-113`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):** Given 2 toast 1 sn arayla gösterilir, Then ikincisi tam 2,4 sn görünmeli. Şu an 1,4 sn görünüyor.

**PNL-15 Ortak bileşen: ConfirmModal**
- **Açıklama:** danger, warning ve info tonları. ESC ve overlay tıklaması kapatır. `onConfirm` hata fırlatırsa modal açık kalır.
- **Nerede:** `web/components/ConfirmModal.tsx:76-117`
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):**
  1. Given `onConfirm` reject eder, Then modal açık kalır ve düğme yeniden etkinleşir.
  2. Given submitting sırasında ESC, Then kapanmaz.

**PNL-16 Ortak bileşen: Select**
- **Açıklama:** Portal ile açılan liste. Klavye desteği: ↑ ↓ Home End Enter Esc Tab ve harfle atlama (`tr` locale). Altta yer yoksa yukarı açılır.
- **Nerede:** `web/components/Select.tsx:34-174`
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):**
  1. Given liste açık, When "ş" basılır, Then "Şef" seçeneğine gider.
  2. Given aynı değer seçilir, Then `onChange` çağrılmaz.

**PNL-17 Ortak bileşen: ImageUploadField**
- **Açıklama:** Sürükle-bırak ya da tıkla. İstemcide `image/*` ve en fazla 5MB kontrolü (`alert()` ile). Önizleme, Değiştir, Kaldır.
- **Nerede:** `web/components/ImageUploadField.tsx:56-72`, `:113-205`
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):**
  1. Given 6MB dosya, Then alert gösterilir ve `onUpload` çağrılmaz.
  2. Given pdf, Then "Lütfen bir resim dosyası seçin."

### KAT — Kategoriler

**KAT-01 Listeleme**
- **Nerede:**
  - API: GET `/api/admin/categories` (`api/routes/adminRoutes.ts:304-316`), `sort_order` artan
  - UI: `web/pages/CategoriesPage.tsx:25-34`, `:126-195`
- **Kurallar:** `business_id = ctx.businessId`. Pasifler de listelenir ve "Pasif" rozeti alır.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):** Given A ve B işletmeleri, When A listeler, Then yalnızca A kategorileri gelir.

**KAT-02 Ekleme**
- **Nerede:** POST `/api/admin/categories` (`adminRoutes.ts:318-345`); UI `CategoriesPage.tsx:36-47` (Enter ile de çalışır)
- **Kurallar:**
  - name 1–120 karakter, sanitize edilir.
  - `sort_order = MAX+1`, `is_active=TRUE`.
  - Bu endpoint menü cache'ini temizlemiyor (yeni kategori boşken önemsiz).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given name="" → 400.
  2. Given `<b>Tatlı</b>` → "Tatlı" kaydedilir.
  3. Given 2 kategori var → yenisinin `sort_order` değeri 3.

**KAT-03 Yeniden adlandırma**
- **Nerede:** PUT `/api/admin/categories/:id` (`adminRoutes.ts:347-381`); UI `CategoriesPage.tsx:49-64`
- **Kurallar:**
  - En az bir alan gönderilmeli (refine `:75`).
  - `WHERE id AND business_id`; bulunamazsa 404.
  - Menü cache'i temizlenir (`:377-378`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given B'nin kategori id'si, When A PUT eder, Then 404.
  2. Given boş body, Then 400.
  3. Given rename, Then Redis'teki `menu:{slug}` silinir.

**KAT-04 Aktif/pasif yapma**
- **Nerede:** `CategoriesPage.tsx:66-77` → PUT `is_active`
- **Kurallar:** Pasif kategori public menüde görünmez (menuService `is_active` filtreleri).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):** Given kategori pasif yapıldı, When public menü istenir, Then kategori yok (cache temizlendiği için).

**KAT-05 Sıralama (yukarı/aşağı)**
- **Nerede:** `CategoriesPage.tsx:79-96`; iki ayrı PUT ile `sort_order` takası
- **Kurallar:** İşlem atomik değil. İlk PUT başarılı olup ikincisi başarısız olursa aynı `sort_order` iki kategoride kalır.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given [1,2], When 2. kategori yukarı alınır, Then sıra [2,1].
  2. Given ikinci PUT 500 döner, Then hata toast'ı ve tutarsızlık oluşur (regresyon testi).

**KAT-06 Silme (soft)**
- **Nerede:** DELETE `/api/admin/categories/:id` (`adminRoutes.ts:383-405`); `is_active=FALSE` olur, 204 döner. UI'da silme düğmesi yok.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given geçerli id → 204 ve `is_active=false`.
  2. Given B'nin id'si → 404.

### URN — Ürünler

**URN-01 Listeleme ve kategori filtresi**
- **Nerede:**
  - API: GET `/api/admin/products?category_id&page&page_size` (`adminRoutes.ts:447-487`)
  - UI: `web/pages/ProductsPage.tsx:55-73`, `:172-179` (Select, yalnızca aktif kategoriler `:41`)
- **Kurallar:**
  - `page_size` en fazla 100. UI sabit olarak 100 istiyor; 100'den fazla ürün görünmez.
  - Başka işletmenin `category_id` değeri → 400 "Kategori işletmeye ait değil."
- **Mevcut test:** `api/test/tenantIsolation.test.ts:90-102` ("A ürününü B göremez")
- **Test önerisi (Öncelik 1):**
  1. Given B'nin category_id'si, Then 400.
  2. Given 150 ürün, Then UI'da yalnızca 100 görünür (hata tespiti).
  3. Given page_size=101, Then 400.

**URN-02 Ürün ekleme**
- **Nerede:** POST `/api/admin/products` (`adminRoutes.ts:489-531`); UI `ProductsPage.tsx:124-142`; modal `:229-304`
- **Kurallar:**
  - `category_id` uuid olmalı ve işletmeye ait olmalı.
  - name 1–160 karakter.
  - `price_int` tamsayı ve ≥0. TL'den kuruşa çeviri `:24-27`; virgül kabul edilir.
  - description en fazla 4000.
  - `image_url` URL olmalı, en fazla 500.
  - `sort_order` varsayılanı MAX+1. `is_active` varsayılanı true.
  - Cache temizlenir.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given fiyat "145,50", Then `price_int=14550`.
  2. Given B'nin kategorisi, Then 400.
  3. Given negatif fiyat, Then UI "Fiyat geçersiz." ve API 400.
  4. Given yeni ürün, Then public menüde görünür.

**URN-03 Ürün güncelleme**
- **Nerede:** PUT `/api/admin/products/:id` (`adminRoutes.ts:533-585`)
- **Kurallar:**
  - Bütün alanlar `COALESCE(param, mevcut)` ile yazılıyor. Bu yüzden alan boşaltılamıyor: `image_url` ve description null'a çekilemez.
  - UI `undefined` gönderiyor (`ProductsPage.tsx:130`).
- **Mevcut test:** `tenantIsolation.test.ts:104-114` (B, A ürününü PUT edemez → 403/404)
- **Test önerisi (Öncelik 1):**
  1. Given görsel "Kaldır" ve Kaydet, Then image_url null olmalı. Şu an eski görsel kalıyor; hata.
  2. Given açıklama silindi, Then null olmalı. Şu an kalıyor.
  3. Given kategori değişimi B'ye, Then 400.

**URN-04 Ürün silme (soft)**
- **Nerede:** DELETE `/api/admin/products/:id` (`adminRoutes.ts:587-609`); UI ConfirmModal ile `ProductsPage.tsx:145-162`
- **Kurallar:** `is_active=FALSE` olur. Geçmiş siparişler `product_name` kopyası taşır.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given silindi, Then listede "Pasif" görünür ve public menüde yok.
  2. Given 404 → toast gösterilir ve modal açık kalır.

**URN-05 Ürün görseli yükleme**
- **Nerede:**
  - POST `/api/admin/upload` (multipart `file`) (`adminRoutes.ts:408-420`)
  - multer ayarı `:20-61`; `api/services/uploadService.ts:19-63`; `api/services/storageService.ts:15-27`
  - UI `ProductsPage.tsx:96-118`
- **Kurallar:**
  - Kabul edilen türler: jpeg, png, webp, gif. En fazla 5MB (multer `LIMIT_FILE_SIZE` → 400).
  - sharp 800px webp ve 300px thumbnail üretir. Piksel sınırı 24MP. Animated kapalı.
  - S3 anahtarı `business/{id}/products/{uuid}.webp`.
  - Dönen `thumb_url` hiçbir yerde KAYDEDİLMİYOR; create ve update şemalarında bu alan yok.
- **Mevcut test:** yok (tenantIsolation `uploadService`'i mock'luyor)
- **Test önerisi (Öncelik 2):**
  1. Given 6MB png → 400 "Dosya 5MB'dan büyük olamaz."
  2. Given text/plain → 400 "Desteklenmeyen dosya türü".
  3. Given bozuk jpeg → 400 "Görsel işlenemedi…".
  4. Given geçerli görsel → `image_url` ve `thumb_url` döner; S3 mock iki kez çağrılır.

**URN-06 Satışa açık/kapalı**
- **Nerede:** form switch `ProductsPage.tsx:286-295`, kart üstü "Pasif" katmanı `:196-201`
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):** Given `is_active=false` kaydedildi, Then public menüde yok ve Panel'de "Satışa kapalı ürün" +1.

**URN-07 `?yeni=1` kısayolu**
- **Nerede:** `ProductsPage.tsx:42-44`, `:81-86`
- **Kurallar:** Kategoriler yüklenince modal açılır ve parametre URL'den silinir.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):**
  1. Given `/admin/products?yeni=1`, Then modal açılır ve ilk aktif kategori seçili gelir.
  2. Given hiç aktif kategori yok, Then modal açılmaz.

### AYR — Ayarlar

**AYR-01 Ayarları yükleme**
- **Nerede:** GET `/api/admin/business` (`adminRoutes.ts:180-196`); UI `web/pages/SettingsPage.tsx:133-152` (yalnızca ilk token ile bir kez), hata kartı `:279-294`
- **Kurallar:**
  - Owner bu uç noktayı yalnızca GET ile okuyabilir (`requireAdminOrOwnerRead(['/business'])`, `adminRoutes.ts:178`; `api/middleware/auth.ts:109-118`).
  - Yükleme hatasında kaydetme kapalıdır.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given owner token, When GET business → 200; When PUT business → 403.
  2. Given API 500, Then "Ayarlar yüklenemedi" ve "Tekrar dene" düğmesi.

**AYR-02 Sekmeler, değişiklik takibi ve sabit Kaydet çubuğu**
- **Açıklama:** Sekmeler: Genel, Görünüm, Servis, İletişim, Wi-Fi, Hesap. Sekme seçimi URL'de `?tab=` olarak tutulur. Değişen sekmede nokta görünür. "N alanda kaydedilmemiş değişiklik" metni, Geri al düğmesi, çift tık kilidi (`savingRef`).
- **Nerede:** `SettingsPage.tsx:47-55`, `:86-94`, `:172-180`, `:218-270`, `:304-317`, `:487-507`
- **Kurallar:** İstemci doğrulaması başarısız olursa ilgili sekmeye geçilir (`fail()` `:213-216`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given telefon geçersiz ve Genel sekmesindeyken Kaydet, Then İletişim sekmesine geçer ve toast gösterir.
  2. Given değişiklik yok, Then Kaydet devre dışı.
  3. Given Geri al, Then form kayıtlı hâline döner.

**AYR-03 İşletme adı ve açıklama**
- **Nerede:** `SettingsPage.tsx:324-334`; API şeması `adminRoutes.ts:86`, `:91`
- **Kurallar:** name trim sonrası 1–120, açıklama en fazla 2000. Metin alanları sanitize edilir. Boş metin NULL yazılır (`clearable`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given name="  " → 400 "İşletme adı boş olamaz."
  2. Given description="" → NULL.
  3. Given güncelleme → menü cache'i silinir.

**AYR-04 Logo yükleme ve kaldırma**
- **Nerede:**
  - UI: yerel önizleme, yükleme "Kaydet"te (`SettingsPage.tsx:183-210`, `:231-232`, `:336-348`)
  - API: POST `/api/admin/upload/logo` (`adminRoutes.ts:423-445`, `processLogo` 400px)
- **Kurallar:**
  - Upload uç noktası DB'yi HEMEN güncelliyor (`:438-442`). Ardından PUT 400 dönerse logo yine de değişmiş olur.
  - Kaldırma: `logo_url: null`.
  - Eski S3 nesneleri silinmiyor.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given logo seçildi ve Kaydet, Then önce upload sonra PUT; yanıtta `logo_url` dolu.
  2. Given logo seçildi ama tema rengi geçersiz, Then şu an upload hiç yapılmıyor (istemci doğrulaması önce). İstemci doğrulaması atlatılıp PUT 400 dönerse logo DB'de değişmiş olur; bu durum için regresyon testi.
  3. Given Kaldır ve Kaydet → NULL.

**AYR-05 Menü linki**
- **Nerede:** `SettingsPage.tsx:351-376` (`copyText`, `${PUBLIC_BASE_URL}/m/{slug}`)
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):** Given clipboard reddi, Then "Kopyalanamadı." toast'ı.

**AYR-06 Tema rengi**
- **Açıklama:** ThemeColorPicker: 12 hazır renk, hex girişi, sistem renk seçici, gündüz ve gece önizlemesi.
- **Nerede:** `web/components/ThemeColorPicker.tsx:10-98`; `SettingsPage.tsx:384-396`; API regex `adminRoutes.ts:80`, `:88`
- **Kurallar:**
  - `#RRGGBB` zorunlu. Sunucu alan bazlı mesaj döner (`:204-211`).
  - Okunurluk `web/lib/businessTheme.ts` ile ayarlanır.
  - QR rengi de `theme_color` kullanır (`adminRoutes.ts:272-283`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given "#abc" → API 400 "Tema rengi #RRGGBB biçiminde olmalı." ve `field=theme_color`.
  2. Given "c2410c" yazılır, Then "#c2410c" kabul edilir.
  3. Given koyu renk, Then önizlemede `on-biz` açık renk olur.

**AYR-07 Ortalama teslim süresi (`late_after_minutes`)**
- **Nerede:** `SettingsPage.tsx:403-428`; API `adminRoutes.ts:101` (1–240)
- **Kurallar:** Panel'deki "Gecikiyor" hesabında kullanılır (`AdminDashboardPage.tsx:110`, `:175`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given 0 → UI hatası ve API 400.
  2. Given 241 → 400.
  3. Given 10 kaydedildi, Then Panel 10 dk eşiğini kullanır.

**AYR-08 Sipariş alımı anahtarı (`is_accepting_orders`)**
- **Nerede:** `SettingsPage.tsx:430-442`; migration `apps/api/migrations/015_settings_extras.sql:16`
- **Kurallar:** Değer yalnızca kaydediliyor; müşteri sipariş akışında kontrol EDİLMİYOR (UI uyarısı `:438-441`). `customerOrderRoutes.ts` içinde referans yok.
- **Mevcut test:** yok
- **Test önerisi (K1, özellik tamamlanınca):** Given `is_accepting_orders=false`, When müşteri POST sipariş, Then 403 ya da 409 olmalı. Şu an kabul ediliyor.

**AYR-09 İletişim bilgileri**
- **Nerede:** `SettingsPage.tsx:446-479`; API `adminRoutes.ts:92-97`
- **Kurallar:**
  - Telefon ve WhatsApp regex'i `^\+?[\d\s\-()]{7,20}$`; e-posta için `email()`.
  - Ülke kodu yoksa uyarı gösterilir (`lacksCountryCode` `:77-81`).
  - `contact_name` müşteriye gösterilmez.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given "abc" telefon → 400 "Telefon numarası geçersiz." ve `field`.
  2. Given "0555…" WhatsApp → uyarı var ama kaydedilir.
  3. Given e-posta "" → NULL.

**AYR-10 Wi-Fi**
- **Nerede:** `SettingsPage.tsx:582-620`; API `adminRoutes.ts:98-99`, `:121-122`
- **Kurallar:** SSID en fazla 64, şifre en fazla 128. Şifre sanitize EDİLMEZ ('raw') ve boşluklar korunur. Menü herkese açık olduğu için şifre de herkese görünür.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):**
  1. Given şifre " a<b " → aynen saklanır.
  2. Given SSID boş, Then menüde Wi-Fi kartı yok.

**AYR-11 Hesap: e-posta gösterimi ve şifre değiştirme**
- **Nerede:** `SettingsPage.tsx:622-697`; API: GIR-10'a bakın.
- **Kurallar:** Başarılı olunca yeni token çifti alınır (`setSessionTokens`). Diğer cihazlar düşer.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):** GIR-10'daki senaryolar ve şu: Given başarı, Then aynı sekmede GET business 200 dönmeye devam eder.

**AYR-12 Sunucu kısmi güncelleme kuralı**
- **Nerede:** `adminRoutes.ts:79-125`, `:198-257`
- **Kurallar:**
  - Gönderilmeyen alan (undefined) korunur. "" ya da null → NULL.
  - Metin alanları `sanitizeText` ile temizlenir (`api/utils/sanitize.ts`; entity'ler geri çözülüyor).
  - Hiç alan yoksa 400.
  - `bg_color` ve `dark_mode` eski alanlar; UI bunları olduğu gibi geri gönderir.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given body `{}` → 400.
  2. Given `{contact_phone: null}` → yalnız bu alan NULL olur, diğerleri değişmez.
  3. Given `{name:"<script>x</script>A"}` → "A".

**AYR-13 Sipariş notu şablonları (OrderNoteTemplates)**
- **Açıklama:** Ayar değil; sabit kodlu 6 kategori şablon (`web/components/OrderNoteTemplates.tsx:26-132`). Tıklanınca ", " ile eklenir ve aynı not tekrar eklenmez (`:151-161`). Müşteri menüsünde (`PublicMenuPage.tsx:847`) ve garson menüsünde (`WaiterMenuPage.tsx:546`) kullanılır.
- **Not:** İstenen "müşteri adisyon görünümü" (customer bill view) ayarı kodda YOK.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):**
  1. Given "Buzsuz" iki kez tıklanır, Then tek kez eklenir.
  2. Given value "Acısız; Buzsuz" ve "Buzsuz" tıklanır, Then eklenmez.

### PRS — Personel

**PRS-01 Listeleme**
- **Nerede:** GET `/api/admin/waiters` (`api/routes/waiterAdminRoutes.ts:83-90`) → `waiterService.ts:179-201`; UI `web/pages/WaitersPage.tsx:118-126`, `:340-417`
- **Kurallar:**
  - `deleted_at IS NULL`.
  - Sıra: active, on_leave, inactive; sonra `created_at` azalan.
  - Yalnızca admin (`requireAdmin`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given owner token → 403.
  2. Given silinmiş personel → listede yok.
  3. Given B'nin personeli → A listesinde yok.

**PRS-02 Personel ekleme**
- **Nerede:** POST `/api/admin/waiters` (`waiterAdminRoutes.ts:93-129`) → `waiterService.ts:114-177`; UI `WaitersPage.tsx:152-191`, form `:420-561`
- **Kurallar:**
  - name 1–100, title en fazla 40, phone en fazla 30.
  - E-posta verilirse şifre zorunlu (en az 8).
  - E-posta işletme içinde benzersiz (`LOWER`).
  - Varsayılan yetki "Garson" şablonu.
  - Modül kapalıysa 403.
  - Hata eşlemesi mesaj metni üzerinden yapılıyor (`msg.includes('email')`); kırılgan.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given e-posta var ve şifre yok → 400 "Email ile giriş için şifre gerekli."
  2. Given aynı e-posta aynı işletmede → 400.
  3. Given modül kapalı → 403.
  4. Given yetki verilmedi → `can_transfer_table=true` ve `can_refund=false`.

**PRS-03 Personel düzenleme**
- **Nerede:** PATCH `/api/admin/waiters/:id` (`waiterAdminRoutes.ts:165-202`) → `waiterService.ts:214-265`
- **Kurallar:**
  - Yetkiler mevcut olanla birleştirilir (merge).
  - E-posta başka personelde varsa 400.
  - "" → null.
  - UUID değilse 400.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given B'nin personel id'si → 404.
  2. Given yalnız `{permissions:{can_refund:true}}` → diğer yetkiler korunur.
  3. Given `email:""` → null.

**PRS-04 Ünvan (title)**
- **Nerede:** `WaitersPage.tsx:38` (öneriler: Garson, Komi, Şef, Aşçı, Barista, Kasiyer, Müdür), `:443-463`, rozet `:356-360`; migration `017_staff_title.sql`
- **Kurallar:** Serbest metin, en fazla 40. Yetkiyle bağlantısı yok.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):** Given title "  " → null.

**PRS-05 Yetki şablonları ve yetki bayrakları**
- **Açıklama:** Şablonlar: Komi, Garson, Şef Garson. Bayraklar: can_refund, can_see_other_tables, can_edit_other_tables, can_transfer_table, can_merge_tables, can_use_break.
- **Nerede:**
  - `web/api/waiterAdminApi.ts:21-37`; UI `WaitersPage.tsx:40-47`, `:503-547`
  - Sunucu varsayılanı `waiterService.ts:28-35`, normalize `:38-48`
  - Uygulama yeri: `api/services/staffPermissions.ts:17-64`
- **Kurallar:**
  - Şablonlar yalnızca frontend'de tanımlı.
  - Eski (020 öncesi) kayıtlarda `can_edit_other_tables` varsayılanı TRUE (`:43`), yeni varsayılan FALSE.
  - Mutfak başlamadan iptal herkese serbest. Sonrasında `can_refund` yoksa admin onayına düşer.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given "Komi" şablonu, Then `can_transfer_table=false`.
  2. Given `permissions={}` eski kayıt, Then `can_edit_other_tables=true` (bilinçli mi? doğrulanmalı).
  3. Given `can_edit_other_tables=false` personel başkasının masasında sipariş ekler → 403 "Bu masa X personelinde…".

**PRS-06 Şifre belirleme ve sıfırlama**
- **Nerede:** PUT `/api/admin/waiters/:id/password` (`waiterAdminRoutes.ts:207-226`) → `waiterService.ts:267-283`; UI `WaitersPage.tsx:205-219`, modal `:563-604`
- **Kurallar:**
  - API null kabul eder (şifreyi kaldırır). UI null göndermiyor.
  - En az 8 karakter.
  - Şifre değişince personelin mevcut oturumları düşmüyor.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given 7 karakter → 400.
  2. Given null → `password_hash` NULL olur ve e-posta girişi "invalid_credentials".
  3. Given B'nin id'si → 404.

**PRS-07 Durum: active / on_leave / inactive**
- **Nerede:** PUT `/api/admin/waiters/:id/status` (`waiterAdminRoutes.ts:230-249`) → `waiterService.ts:285-326`; UI Select `WaitersPage.tsx:398-407`
- **Kurallar:**
  - active dışındaki durumlarda `is_active=false` olur ve tüm `waiter_sessions` iptal edilir (transaction).
  - QR düğmesi yalnızca active personelde görünür.
  - Bu değişiklik `staff_update` olayı yayınlamıyor.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given on_leave, Then aktif oturum `revoked_at` dolar ve personel isteği 401 alır.
  2. Given geçersiz status → 400.
  3. Given inactive'den active'e, Then yeni QR üretilebilir.

**PRS-08 Personel silme (soft)**
- **Nerede:** DELETE `/api/admin/waiters/:id` (`waiterAdminRoutes.ts:253-276`) → `waiterService.ts:338-392`; UI ConfirmModal `WaitersPage.tsx:256-279`
- **Kurallar:**
  - pending, preparing ya da ready siparişi varsa 400 ve `pending_count` döner.
  - Silinince `deleted_at` dolar, status inactive olur, oturumlar iptal edilir.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given 2 bekleyen siparişi var → 400 ve `pending_count=2`.
  2. Given yok → 200, listeden düşer, giriş yapamaz.
  3. Given aynı e-postayla yeni personel → izin verilir (`deleted_at` filtresi).

**PRS-09 QR ve giriş linki üretme**
- **Nerede:** POST `/api/admin/waiters/:id/token` `{hours_valid:1-12}` (`waiterAdminRoutes.ts:279-310`) → `waiterService.ts:394-453`; UI `WaitersPage.tsx:221-230`, `:606-709`
- **Kurallar:**
  - Önceki bütün oturumlar iptal edilir. Opak token, hash'i saklanır.
  - Personel aktif değilse 404.
  - QR görseli dış servis `api.qrserver.com` ile üretiliyor ve token URL'de gidiyor (`:285-288`).
  - Link biçimi `${PUBLIC_BASE_URL}/g/{token}`.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given hours_valid=13 → 400.
  2. Given yeni token, Then eski token ile exchange 401 (revoked).
  3. Given on_leave personel → 404.
  4. Given `expires_at` = şimdi + N saat (±5 sn).

**PRS-10 Aktif oturumları iptal etme**
- **Nerede:** GET `/api/admin/waiters/:id/sessions` (`:313-326`), POST `/api/admin/waiters/sessions/:session_id/revoke` (`:329-346`); UI döngüsü `WaitersPage.tsx:233-253`
- **Kurallar:** `revokeWaiterSession` `business_id` ile sınırlıdır (`waiterService.ts:470-482`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given B'nin session id'si → 404.
  2. Given 2 oturum → "2 oturum iptal edildi".

**PRS-11 WhatsApp gönderimi ve link kopyalama**
- **Nerede:** `WaitersPage.tsx:49-53`, `:678-699`
- **Kurallar:** İşletme adı sabit kod 'AtlasQR' (`:692`); gerçek işletme adı kullanılmıyor.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):** Given telefon "0532 123", Then link `wa.me/0532123?text=...`.

**PRS-12 Vardiya ve mola altyapısı (staffService)**
- **Nerede:** `api/services/staffService.ts:52-147` (startBreak, endBreak, recordShiftEvent; `waiter_activity_log`); molalar 5–60 dk (`:16`)
- **Kurallar:**
  - Zaten moladaysa yeni mola null döner.
  - Süre dolunca otomatik bitmez.
  - Vardiya başında açık mola kapatılır.
  - Her olay `staff_update` yayınlar.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given molada, When tekrar startBreak, Then null (409).
  2. Given endBreak 20 dk sonra ve mola 15 dk, Then `overdue_min=5`.
  3. Given shift_start ve açık mola var, Then mola temizlenir.

**PRS-13 `?yeni=1` kısayolu**
- **Nerede:** `WaitersPage.tsx:106-112`
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):** Given URL'de yeni=1, Then form açılır ve parametre silinir.

---

## B) KİMLİK DOĞRULAMA (GIR)

**GIR-01 Giriş**
- **Nerede:** POST `/api/auth/login` (ayrıca `/auth/login`) (`api/routes/authRoutes.ts:13-34`) → `api/services/authService.ts:35-90`; UI `web/pages/LoginPage.tsx:19-36`; şema `packages/shared/src/validators.ts:3-6`
- **Kurallar:**
  - E-posta küçük harfe çevrilir. Şifre en az 8 (eski ve daha kısa şifreler giremez).
  - Kullanıcı aktif olmalı.
  - Yanlış bilgi → 401 "E-posta veya şifre hatalı."
  - İşletme pasifse → 403 "askıya alındı".
  - Yanıt: access (JWT, varsayılan 15m) + opak refresh (hash'i `users.refresh_token_hash` içinde) + role, email, business.
  - Yeni giriş eski refresh'i geçersiz kılar: kullanıcı başına tek refresh token var.
- **Mevcut test:** `api/test/authFlow.test.ts:53-68` (login başarılı/başarısız, refresh; servis mock)
- **Test önerisi (Öncelik 1):**
  1. Given askıya alınmış işletme admini doğru şifreyle girer → 403.
  2. Given `is_active=false` kullanıcı → 401.
  3. Given "ADMIN@X.COM" → giriş başarılı.
  4. Given cihaz A girdi, sonra cihaz B girdi, Then A'nın refresh'i 401 (bilinçli mi? doğrulanmalı).

**GIR-02 Rol bazlı yönlendirme**
- **Nerede:**
  - `LoginPage.tsx:24-30`: superadmin → `/superadmin`, owner → `/owner`, diğerleri → `/admin`
  - Koruyucular: `App.tsx:48-60`
  - `/superadmin` ve `/superadmin/errors` rotalarında `RequireAuth` YOK; kontrol sayfanın içinde (`SuperAdminPage.tsx:62-69`, `ErrorLogPage.tsx:107-111`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given admin `/superadmin` açar → `/login`'e gider.
  2. Given owner `/admin` açar → `/owner`.
  3. Given admin `/owner` açar → `/login`.

**GIR-03 RequireAuth ve token saklama**
- **Nerede:** `web/components/RequireAuth.tsx:4-12`; `web/auth/AuthContext.tsx:63-150`
- **Kurallar:**
  - Token'lar sessionStorage'da tutulur (sekme izolasyonu). Eski localStorage anahtarları temizlenir.
  - `isAuthenticated` yalnızca accessToken var mı diye bakar.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given yeni sekme, Then oturum yok.
  2. Given eski localStorage token'ı, Then mount sırasında silinir.

**GIR-04 Access token yenileme**
- **Nerede:** POST `/api/auth/refresh` (`authRoutes.ts:36-48`) → `authService.ts:92-120`; istemci `web/api/client.ts:25-66`
- **Kurallar:**
  - 401 alınınca bir kez refresh denenir ve istek tekrarlanır.
  - Refresh token döndürülmez (rotation yok).
  - İşletme pasifse null → 401.
  - Yalnızca `apiRequest` kullanan çağrılar yenilenir. `superadminApi`, `waiterAdminApi` ve `ownerApi` yenilenmez.
- **Mevcut test:** `authFlow.test.ts:65-67`
- **Test önerisi (Öncelik 1):**
  1. Given süresi dolmuş access ve geçerli refresh, When GET `/admin/categories`, Then otomatik 200.
  2. Given 16 dk sonra SuperAdminPage "Yenile", Then şu an "Geçersiz token." hatası (regresyon).
  3. Given refresh token ≤ 19 karakter → 400.

**GIR-05 Çıkış**
- **Nerede:** `AuthContext.tsx:137-144`; `Layout.tsx:192`; `OwnerLayout.tsx` (Çıkış düğmesi); `SuperAdminPage.tsx:208`
- **Kurallar:** Yalnızca istemci tarafında. Sunucu refresh'i iptal etmiyor.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):** PNL-07'ye bakın.

**GIR-06 requireAuth middleware**
- **Nerede:** `api/middleware/auth.ts:8-76`
- **Kurallar:**
  - Her istekte DB'den `password_version`, role, business ve `is_active` okunur.
  - `password_version` farklıysa 401.
  - İşletme pasifse 403.
  - Rol DB'den alınır, `businessId` JWT'den gelir.
  - superadmin için `businessId=''` olur; admin uç noktalarında bu uuid hatası ve 500 doğurur.
- **Mevcut test:** dolaylı (tenantIsolation `requireAuth`'u mock'luyor)
- **Test önerisi (Öncelik 1):**
  1. Given şifre değişti, eski access token → 401 "Oturum geçersiz…".
  2. Given işletme askıya alındı → 403.
  3. Given kullanıcı rolü admin'den owner'a çevrildi, eski JWT → owner gibi davranılır.
  4. Given superadmin GET `/api/admin/categories` → 500 değil 403 olmalı.

**GIR-07 Rol middleware'leri**
- **Nerede:** `auth.ts:82-118` (`requireOwner`: owner+superadmin; `requireAdmin`: admin+superadmin; `requireSuperAdmin`; `requireAdminOrOwnerRead`)
- **Mevcut test:** dolaylı (tenantIsolation rol modülünü gerçek kullanıyor)
- **Test önerisi (Öncelik 1):**
  1. Given owner → POST `/api/admin/products` 403.
  2. Given owner → GET `/api/admin/business` 200.
  3. Given admin → GET `/api/owner/reports/overview` 403.

**GIR-08 Şifre sıfırlama isteği**
- **Nerede:** POST `/api/auth/request-reset` (`authRoutes.ts:50-67`) → `authService.ts:122-143`; mail `api/services/mailService.ts:16` (`${APP_URL}/sifre-sifirla?token=`); UI `web/pages/ResetPage.tsx:15-23`
- **Kurallar:**
  - Kullanıcı yoksa da 200 döner (enumeration koruması).
  - Token 30 dk geçerli. Rate limit 3/dk (IP+email).
  - Mail hatasında 500 ve `String(error)` sızar.
  - UI hataları yutuyor (`catch {}`) ve kullanıcıya hiçbir şey göstermiyor.
- **Mevcut test:** `authFlow.test.ts:70-75`
- **Test önerisi (Öncelik 1):**
  1. Given olmayan e-posta → 200 ve mail gönderilmez.
  2. Given mail adapter hata atar → 500 ama ham hata metni sızmamalı.
  3. Given 4 istek/dk → 429.

**GIR-09 Sıfırlama linkinin doğrulanması ve yeni şifre**
- **Nerede:**
  - POST `/api/auth/reset-token/validate` (`authRoutes.ts:70-77`), POST `/api/auth/reset-password` (`:108-121`) → `authService.ts:146-153`, `:202-248`
  - UI `web/pages/ResetPasswordPage.tsx:22-58` (checking, valid, invalid ekranları)
- **Kurallar:**
  - Token tek kullanımlık (`used_at`), `FOR UPDATE` transaction içinde.
  - `password_version++` ve `refresh_token_hash=NULL`.
  - Doğrulama isteği ağ hatası verirse form yine gösterilir.
- **Mevcut test:** `authFlow.test.ts:77-85` (ikinci kullanım başarısız)
- **Test önerisi (Öncelik 1):**
  1. Given süresi dolmuş token, Then validate `{valid:false}` ve reset 400.
  2. Given reset başarılı, Then eski access 401 ve eski refresh 401.
  3. Given token 10 karakter, Then validate false.

**GIR-10 Oturum açıkken şifre değiştirme**
- **Nerede:** POST `/api/auth/change-password` (`authRoutes.ts:85-106`) → `authService.ts:163-200`
- **Kurallar:**
  - Önce rate limit (5/dk, IP), sonra `requireAuth`.
  - Yeni şifre en az 8. Yanlış mevcut şifre → 400. Aynı şifre → 400.
  - `password_version++`; yeni token çifti döner; Cache-Control: no-store.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given doğru mevcut şifre, Then 200, yeni token'lar çalışır, eski token 401.
  2. Given yanlış → 400 "Mevcut şifre hatalı."
  3. Given yeni=eski → 400.
  4. Given 6. deneme/dk → 429.

**GIR-11 Rate limit'ler (Redis sliding window)**
- **Nerede:** `api/middleware/rateLimit.ts:15-99`
- **Limitler:**
  - login: 5/dk, IP+email
  - change-password: 5/dk, IP
  - request-reset: 3/dk, IP+email
  - public menu: 60/dk, IP
  - public order: 10/dk, IP+masa
  - waiter session: 30/dk, IP+tab
  - waiter login: 10/dk, IP+email
  - call: 10/dk, IP+masa
- **Kurallar:**
  - 429 `RATE_LIMITED` döner ve error_log'a yazılmaz.
  - `trust proxy` = 1 (`app.ts:36`).
  - Error ingest `publicMenuRateLimit` kovasını paylaşıyor.
- **Mevcut test:** yok (authFlow tüm limiter'ları geçirgen yapıyor)
- **Test önerisi (Öncelik 1):**
  1. Given 6 login/dk aynı email → 6.'sı 429.
  2. Given farklı email → ayrı kova.
  3. Given 60 hata ingest + 1 menü isteği aynı IP → menü 429 (hata tespiti).

**GIR-12 optionalAuth (hata kaydı için)**
- **Nerede:** `auth.ts:127-165`
- **Kurallar:** JWT doğrulanır ama DB kontrolü yapılmaz. Token geçersizse anonim devam edilir.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):** Given süresi dolmuş token → hata kaydı `user_id=null` ile yazılır.

---

## C) İŞLETME SAHİBİ (SAH)

**SAH-01 Owner rota koruması ve layout**
- **Nerede:** `App.tsx:48-53`, `:84-93`; `web/pages/owner/OwnerLayout.tsx` (işletme adı avatarı, e-posta, Çıkış, tek sekme "Dashboard"); API `api/routes/ownerRoutes.ts:11-13` (`requireAuth` + `requireOwner`)
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given admin token → GET `/api/owner/reports/overview` 403.
  2. Given owner → 200.
  3. Given owner pasif yapıldı (superadmin) → `password_version++` sonrası 401.

**SAH-02 Tarih aralığı (hazır aralıklar ve özel)**
- **Nerede:** `web/api/ownerApi.ts:141-187` (today, yesterday, last_7, last_30, this_month); `web/pages/owner/OwnerDashboardPage.tsx:75-120`, `:491-540` (varsayılan last_7)
- **Kurallar:** from/to "YYYY-MM-DD" biçiminde gönderilir.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given 15 Mart'ta last_7, Then 09–15 Mart.
  2. Given custom from>to → API 400 '"from" tarihi…'.

**SAH-03 Rapor özeti uç noktası**
- **Nerede:** GET `/api/owner/reports/overview?from&to` (`ownerRoutes.ts:25-290`); 9 sorgu paralel çalışır.
- **Kurallar:**
  - Yalnızca `type='order'`.
  - Ciro yalnızca delivered siparişlerden.
  - İptal oranı = cancelled / (delivered + cancelled), bir ondalık.
  - Kasa açığı: `cancel_reason LIKE 'no_payment%'`.
  - Hazırlama süresi: `delivered_at - created_at`.
  - Gün sınırları sunucunun yerel saatine göre (`setHours`, `:35-38`). `new Date('YYYY-MM-DD')` UTC olarak yorumlanır, bu yüzden TR saatinde kayma olabilir.
  - hourly ve daily sorgularında "orders" = `COUNT(*)` bir LEFT JOIN `order_items` üzerinden; sipariş değil kalem satırı sayıyor (`:92`, `:113`).
  - Ciro hesabı indirim/ikram (022) ve kalem iptalini (023) dikkate almıyor (`:69-77`); doğrulanmalı.
  - Hata olursa 500 "Rapor oluşturulamadı."
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given 1 delivered sipariş 3 kalemli, Then `hourly[h].orders` 1 olmalı (şu an 3 dönüyor).
  2. Given 23:30 TR saatinde verilen sipariş ve "today" filtresi, Then rapora girmeli.
  3. Given B'nin siparişleri, Then A raporunda yok.
  4. Given from="abc" → 400.

**SAH-04 Satış sekmesi**
- **Açıklama:** Günlük çizgi grafik, 24 saatlik bar grafik (eksik saatler 0 ile doldurulur) ve masa performansı. recharts kullanılır; renkler `useChartTheme` ile.
- **Nerede:** `OwnerDashboardPage.tsx:191-310`
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):** Given yalnız 14:00 verisi var, Then 24 bar ve diğerleri 0.

**SAH-05 Ürün sekmesi**
- **Açıklama:** Adet ya da ciroya göre en çok satan 10 ürün.
- **Nerede:** `OwnerDashboardPage.tsx:312-377`; API `ownerRoutes.ts:128-167` (`product_name` ile gruplanır)
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):** Given ürün adı değişti, Then iki ayrı satır görünür (bilinen davranış).

**SAH-06 İptal ve risk sekmesi**
- **Açıklama:** Kasa açığı alarmı, iptal sebep dağılımı.
- **Nerede:** `OwnerDashboardPage.tsx:379-485`; sebep etiketleri `ownerApi.ts:202-216`
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given `no_payment:…` ile iptal, Then "KASA AÇIĞI ALARMI" ve tutar görünür.
  2. Given `cancellation_rate` ≥ 10, Then KPI kırmızı.

**SAH-07 KPI şeridi**
- **Nerede:** `OwnerDashboardPage.tsx:150-185`
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):** Given `avg_prep_seconds=757`, Then "12 dk 37 sn".

---

## D) SÜPER ADMİN (SUP) ve HATA KAYITLARI (HAT)

### SUP — Süper Admin

**SUP-01 Erişim kontrolü**
- **Nerede:**
  - UI: `web/pages/SuperAdminPage.tsx:62-69` (token yoksa ya da rol superadmin değilse `/login`)
  - API: `api/routes/superAdminRoutes.ts:27-46` (yalnızca JWT verify ve `role==='superadmin'`; DB kontrolü yok)
  - Bütün API çağrıları `web/api/superadminApi.ts` üzerinden `fetch` ile yapılıyor; refresh yok.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given admin token → `/api/superadmin/businesses` 403.
  2. Given superadmin şifresi değişti, eski JWT → şu an 200 (requireAuth gibi 401 olmalı).
  3. Given token yok → 401.

**SUP-02 İşletme listesi ve istatistikler**
- **Nerede:** GET `/api/superadmin/businesses` (`superAdminRoutes.ts:52-74`); UI kartlar `SuperAdminPage.tsx:247-269`, masaüstü tablo `:277-351`, mobil kart `:354-425`
- **Kurallar:** Admin e-postası (ilk admin), owner_count (aktif), category_count, product_count, iki modül bayrağı.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given pasif owner var, Then owner_count'a dahil değil.
  2. Given pasif işletme, Then satır kırmızı ve "Pasif" sayacı +1.

**SUP-03 İşletme ve admin oluşturma**
- **Nerede:** POST `/api/superadmin/businesses` (`superAdminRoutes.ts:76-124`); UI `SuperAdminPage.tsx:75-127`, modal `:429-486`
- **Kurallar:**
  - slug `^[a-z0-9-_]+$` ve en fazla 80. UI Türkçe karakterleri dönüştürür.
  - e-posta geçerli, şifre en az 8.
  - Slug ya da e-posta zaten varsa 400.
  - İşletme ve admin tek transaction'da oluşturulur.
  - Kontrol ile insert arasında yarış var; unique ihlali 500 doğurur.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given slug "Kafe Ş" → UI "kafe-s".
  2. Given mevcut slug → 400 "Bu slug zaten kullanılıyor."
  3. Given başarı, Then yeni admin login → `/admin` ve boş kategoriler.
  4. Given kullanıcı insert'i başarısız, Then işletme de oluşmaz (rollback).

**SUP-04 İşletmeyi askıya alma / aktifleştirme**
- **Nerede:** PUT `/api/superadmin/businesses/:id` `{is_active}` (`superAdminRoutes.ts:126-152`); UI `SuperAdminPage.tsx:129-138` (onay modalı yok)
- **Kurallar:**
  - Pasif yapılınca işletmenin bütün kullanıcılarında `password_version++` (oturumlar düşer).
  - Body doğrulanmıyor: `is_active` undefined ya da id uuid değilse 500.
  - Public menü cache'i temizlenmiyor (≤120 sn açık kalır).
  - Personel oturumları açık kalır; garson auth `business_active` kontrol ettiği için çalışmaz.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given askıya alındı, Then admin istekleri 403 ya da 401, login 403, refresh 401.
  2. Given body `{}` → 400 olmalı (şu an 500).
  3. Given askıya alındı, Then public menü 404 olmalı (cache sonrası).
  4. Given tekrar aktif, Then login çalışır.

**SUP-05 Admin şifresi sıfırlama**
- **Nerede:** PUT `/api/superadmin/businesses/:id/reset-password` (`superAdminRoutes.ts:154-178`); UI modal `SuperAdminPage.tsx:162-178`, `:489-529`
- **Kurallar:**
  - Şifre en az 8. `role='admin'` olan bütün kullanıcılar güncellenir.
  - `rowCount !== 1` ise 404 döner, ama güncelleme zaten yapılmış olur (birden fazla admin varsa).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given 7 karakter → 400.
  2. Given başarı → eski token 401, yeni şifreyle login.
  3. Given 2 admin → şu an 404 ve ikisi de değişmiş (regresyon).

**SUP-06 Personel modülü aç/kapa**
- **Nerede:** PATCH `/api/superadmin/businesses/:id/waiter-module` `{enabled}` (`superAdminRoutes.ts:333-353`) → `waiterService.ts:575-589`; UI `SuperAdminPage.tsx:140-149`
- **Kurallar:** Kapatınca garson auth `module_disabled` döner (`waiterService.ts:520`, `:566`, `:639`, `:730`). Admin menüsünde sekme gizlenir.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given kapatıldı, Then açık garson sekmesi bir sonraki istekte 403 ya da 401 ve sebep `module_disabled`.
  2. Given id "abc" → 400.

**SUP-07 Mutfak modülü aç/kapa**
- **Nerede:** PATCH `/api/superadmin/businesses/:id/kitchen-module` (`superAdminRoutes.ts:362-385`); UI `:151-160`
- **Kurallar:** Kapatınca mutfak linki çalışmaz (`kitchenRoutes`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):** Given kapatıldı, Then `/api/kitchen?t=` reddedilir ve admin Mutfak sekmesi gizlenir.

**SUP-08 Owner yönetim modalı**
- **Nerede:**
  - API: GET, POST `/api/superadmin/businesses/:id/owners`; PUT `/:userId` (aktif/pasif + `password_version++`); DELETE `/:userId` (HARD delete); PUT `/:userId/reset-password` (`superAdminRoutes.ts:184-321`)
  - UI: `web/pages/superadmin/OwnerManagementModal.tsx:38-110` (silmede tarayıcının `confirm()` diyaloğu, `:89`)
- **Kurallar:** E-posta global olarak benzersiz. Şifre en az 8. `password_resets` silmede CASCADE.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given owner pasif → login 401.
  2. Given owner silindi → aynı e-posta yeniden eklenebilir.
  3. Given başka işletmenin userId'si → 404.
  4. Given reset-password → eski token 401.

**SUP-09 Servis bitiş tarihleri (service_expirations)**
- **Nerede:** Yalnızca tablo ve seed var: `apps/api/migrations/010_error_log_and_service_expirations.sql:58-90`. API ve UI yok.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):** Özellik yazılınca: Given `expires_at` 10 gün sonra ve threshold 15, Then uyarı.

**SUP-10 CLI araçları**
- **Nerede:** `api/scripts/superadminSql.ts` (gizli şifre sorup argon2 ile SQL üretir), `api/scripts/createBusinessUser.ts`
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):** Given stdin ile e-posta ve şifre, Then çıktıda INSERT ve argon2 hash var.

### HAT — Hata Kayıtları

**HAT-01 Frontend'den hata alma**
- **Nerede:** POST `/api/error-log` (`api/routes/errorLogRoutes.ts:36-95`; `optionalAuth` + `publicMenuRateLimit`)
- **Kurallar:**
  - Şema bozuksa sessizce 204.
  - İstemci CRITICAL gönderirse HIGH'a düşürülür.
  - context zenginleştirilir: url, ua, ip, received_at.
  - `business_id` için JWT önceliklidir; body'deki değer bilgi amaçlı.
  - `logError` `setImmediate` ile asenkron çalışır.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given severity=CRITICAL → DB'ye HIGH yazılır.
  2. Given message boş → 204 ve kayıt yok.
  3. Given JWT A ve body business_id B → A yazılır.
  4. Given 61 istek/dk → 429.

**HAT-02 Backend hata kalıcılığı**
- **Nerede:** `api/middleware/errorHandler.ts:11-74`; `api/errors/AppError.ts` (5xx → HIGH, diğerleri LOW)
- **Kurallar:**
  - Yalnızca CRITICAL ve HIGH DB'ye yazılır; 429 yazılmaz.
  - Yanıt biçimi `{message, code, requestId}`.
  - fingerprint_extra = `METHOD:path`.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given route throw `new Error` → 500 "Sunucu hatası." ve error_log'a HIGH backend satırı.
  2. Given 404 → kayıt yok.
  3. Given 429 → kayıt yok.

**HAT-03 Fingerprint ile tekilleştirme**
- **Nerede:** `api/services/errorLogService.ts:23-91`
- **Kurallar:**
  - Hash bileşenleri: source, mesajın ilk 200 karakteri, stack'teki ilk "at " satırı, extra.
  - Son 1 saatte aynı fingerprint'li 'new' kayıt varsa `occurrence_count++` ve context güncellenir.
  - Boş string uuid'ler null'a çevrilir.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given aynı hata 3 kez → 1 satır ve count=3.
  2. Given ilk kayıt resolved, Then yeni satır açılır.
  3. Given 61 dk sonra → yeni satır.

**HAT-04 Listeleme ve filtreler**
- **Nerede:** GET `/api/superadmin/errors?severity&source&status&business_id&search&since&limit&offset` (`errorLogRoutes.ts:114-154`) → `errorLogService.ts:144-214`
- **Kurallar:**
  - Virgüllü değerler whitelist'e göre filtrelenir.
  - limit en fazla 200.
  - Sıralama: önce severity önceliği, sonra `last_seen_at` azalan.
  - search `ILIKE` ile yapılır (parametreli).
  - Erişim: `/api/superadmin` router'ı (JWT) + `requireAuth` + `requireSuperAdmin` (`:105-106`).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given admin token → 403.
  2. Given `severity=CRITICAL,FOO` → yalnız CRITICAL.
  3. Given limit=500 → 400.
  4. Given search="%'" → güvenli sonuç.

**HAT-05 İstatistikler**
- **Nerede:** GET `/api/superadmin/errors/stats` (`errorLogRoutes.ts:109-112`; `errorLogService.ts:245-270`)
- **Kurallar:** Aktif kritik ve aktif yüksek yalnızca status='new' olanları sayar; total_24h ve total_7d `last_seen_at` üzerinden.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):** Given 1 CRITICAL new ve 1 CRITICAL investigating → critical_active=1.

**HAT-06 Detay**
- **Nerede:** GET `/api/superadmin/errors/:id` (`errorLogRoutes.ts:159-171`)
- **Kurallar:** uuid değilse 400, yoksa 404. businesses ve users ile join edilir.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):** Given işletme silinmiş → `business_name` null; UI "İşletme ID (silinmiş?)" gösterir.

**HAT-07 Durum değişikliği ve çözüm notu**
- **Nerede:** PATCH `/api/superadmin/errors/:id` `{status: investigating|resolved|ignored, resolution_note?}` (`errorLogRoutes.ts:173-200`) → `errorLogService.ts:226-243`
- **Kurallar:**
  - resolved ya da ignored olunca `resolved_at` ve `resolved_by` dolar; investigating olunca NULL'a çekilir.
  - Not `COALESCE` ile yazılır, yani silinemez.
  - 'new' durumuna geri dönülemez.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given resolved ve not → `resolved_by` = superadmin id.
  2. Given status='new' → 400.
  3. Given investigating sonra resolved → `resolved_at` dolu.

**HAT-08 ErrorLogPage arayüzü**
- **Nerede:** `web/pages/superadmin/ErrorLogPage.tsx`:
  - koruma `:107-114`
  - başlık `:191-227`
  - stat kartları `:232-260`
  - filtreler `:263-341` (varsayılan status new+investigating `:91`, arama Enter ile `:275`)
  - masaüstü tablo `:344-418`
  - mobil kartlar `:421-472`
  - sayfalama (30/sayfa) `:475-489`
  - detay modalı ve aksiyonlar `:493-626`
- API istemcisi `web/api/errorLogApi.ts` `apiRequest` kullanıyor, yani refresh var.
- **Kurallar:** Pasif filtre çiplerinde yazı rengi = zemin rengi (`:294`, `:331`); etiketler görünmüyor.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given filtre değişti, Then page=0'a döner.
  2. Given "Çözüldü", Then modal kapanır ve liste yenilenir.
  3. Given pasif severity çipi, Then etiket okunur olmalı (hata tespiti).

**HAT-09 errorReporter (istemci)**
- **Nerede:** `web/lib/errorReporter.ts:38-185`; kurulum `web/main.tsx:11`
- **Kurallar:**
  - Oturum içinde fingerprint ile tekilleştirme (en fazla 200).
  - Circuit breaker: 5xx ya da ağ hatasında 60 sn.
  - Sayfa hidden iken sendBeacon. JSON blob cross-origin gönderildiği için CORS'a takılabilir.
  - 5 sn timeout. Gürültü filtresi (ResizeObserver, Script error…).
  - API 5xx'leri `client.ts:71-89` ile raporlanır; `/error-log` hariç.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given aynı hata iki kez → tek POST.
  2. Given ingest 500 → 60 sn boyunca POST yok.
  3. Given "ResizeObserver loop…" → gönderilmez.

**HAT-10 AppErrorBoundary**
- **Nerede:** `web/components/AppErrorBoundary.tsx:24-177`; `main.tsx:15-17`
- **Kurallar:** HIGH raporlar. Mesajın 200 karakteri gösterilir. "Sayfayı yenile" ve "Ana sayfaya dön" düğmeleri.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):** Given render'da throw eden bileşen, Then fallback ekranı ve `reportError(type='react-error-boundary')`.

**HAT-11 Saklama süresi (cron)**
- **Nerede:** `apps/api/migrations/011_error_log_retention_cron.sql`: pg_cron varsa her gün 03:00 UTC'de silme yapılır (LOW 7, MEDIUM 14, HIGH 30, CRITICAL 90 gün).
- **Kurallar:** pg_cron yoksa atlanır (Railway, lokal); yani orada temizlik yok.
- **Mevcut test:** CI'de migration'ın çalışması dolaylı test sayılır.
- **Test önerisi (Öncelik 3):** Given pg_cron yok, Then migration NOTICE ile geçer.

---

## E) PLATFORM (PLT)

**PLT-01 Tenant izolasyonu**
- **Nerede:**
  - Bütün admin sorgularında `business_id = ctx.businessId` (ör. `adminRoutes.ts:170-173`, `:307-312`, `:367`, `:480`, `:561`); `waiterService` (`:208`, `:251`, `:277`, `:299`, `:348`, `:462`, `:477`); `staffService.ts:158`, `:169`; `ownerRoutes` tüm sorgular.
  - `ctx.businessId` imzalı JWT'den gelir (`auth.ts:65`).
- **Kurallar:**
  - Garson e-posta girişi global arama yapıyor, ama benzersizlik işletme bazlı (`waiterService.ts:538-551` ile `:146-152`). İki işletmede aynı e-posta varsa ikisi de giremez.
  - error_log ingest'te body'deki `business_id` kontrolsüz yazılabiliyor (bilgi amaçlı).
- **Mevcut test:** `tenantIsolation.test.ts` (yalnızca ürün GET ve PUT; SQL metni eşleştirmeli mock)
- **Test önerisi (K1, gerçek Postgres ile entegrasyon önerilir):** Given A ve B işletmeleri, When A token'ı B'nin kategori, ürün, personel, oturum, change-request ve masa id'leriyle PUT, DELETE ya da PATCH yapar, Then hepsi 404 ya da 400 ve B'nin verisi değişmez. Bir döngü içinde bütün uç noktalar denenmeli.

**PLT-02 SSE altyapısı**
- **Nerede:**
  - `api/db/redisPubSub.ts:6-46`: publisher ve subscriber, kanal referans sayımı `:21-41`, kanal adı `new_order:{businessId}`
  - Admin akışı: GET `/api/admin/orders/stream` (`api/routes/orderRoutes.ts:41-85`; 15 sn ping, close'da off ve unsubscribe)
  - Garson akışı: `waiterPublicRoutes.ts:715-755`; mutfak akışı: `kitchenRoutes.ts:195-245`
- **Kurallar:**
  - Son dinleyici gidince unsubscribe edilir.
  - subscribe hata verse de sayaç artmış kalıyor (`:24-27`).
  - Tek subscriber'a bağlantı başına bir `message` handler eklenir (O(n) dağıtım).
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given 2 admin sekmesi, biri kapanır, Then diğeri olay almaya devam eder (refcount 1).
  2. Given ikisi de kapanır, Then Redis UNSUBSCRIBE çağrılır.
  3. Given A'ya publish, Then B akışına hiçbir şey gitmez.
  4. Given 15 sn bekleme, Then ": ping" gelir.

**PLT-03 `publishTablesChangedOnSuccess`**
- **Nerede:** `api/middleware/realtime.ts:8-24`; kullanım: `sessionRoutes.ts:22`, `paymentRoutes.ts:24`, `ledgerRoutes.ts:24`, `:74`, `tableOperationsRoutes.ts:84`, `:154`
- **Kurallar:** GET'te yayın yapılmaz. Yalnızca 2xx yanıtın `finish` anında yayınlanır. `businessId` ya `ctx`'ten ya `req.waiter`'dan gelir. Yayın hatası yutulur.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given POST 200 → `tables_changed` yayınlanır.
  2. Given POST 400 → yayın yok.
  3. Given GET → yayın yok.

**PLT-04 İstemci SSE ve olay dağıtımı (OrderContext)**
- **Nerede:** `web/context/OrderContext.tsx:325-508`; fetch stream, 3 sn'de yeniden bağlanma, 60 sn'de bir tam senkron
- **Olay → window event eşlemesi:**
  - `staff_update` → `atlasqr:staff-update`
  - `change_request` → `atlasqr:change-request`
  - `tables_changed` → `atlasqr:tables-changed`
  - `new_order` ve `call` → ses + liste güncellemesi
  - `call_taken`, `order_cancelled`, `order_status`, `kitchen_order_ready`, `order_items_added`, `order_items_updated` → durum güncellemeleri
- **Kurallar:**
  - Access token süresi dolunca stream 401 alıyor ve aynı token ile 3 sn'de bir yeniden deneniyor. 60 sn'lik `apiRequest` token'ı yenileyince düzeliyor.
  - Konsola yoğun log basılıyor.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given `staff_update` olayı, Then window event dispatch edilir.
  2. Given order_status=delivered, Then aktif listeden düşer.
  3. Given stream kapanır, Then 3 sn sonra yeniden bağlanır.

**PLT-05 CORS, helmet ve header'lar**
- **Nerede:** `api/app.ts:38-53`
- **Kurallar:**
  - origin = `WEB_ORIGIN` (tek origin), credentials açık.
  - allowedHeaders: Authorization, X-Request-Id, X-Super-Admin-Secret (kullanılmıyor), X-Tab-ID, X-Customer-Token, X-Kitchen-Token.
  - exposedHeaders: Content-Disposition (Excel indirmeleri için).
  - maxAge 86400. JSON limiti 1mb. helmet CORP cross-origin.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 1):**
  1. Given Origin=evil.com preflight → ACAO yok.
  2. Given WEB_ORIGIN → `Access-Control-Expose-Headers` içinde Content-Disposition var.
  3. Given 2MB JSON → 413.

**PLT-06 Başlangıçta migration çalıştırma**
- **Nerede:** `api/server.ts:12-36` (yalnızca production: `pnpm migrate:up`, başarısız olursa `exit(1)`; ardından `redis.ping`); migration'lar `apps/api/migrations/001–023` (node-pg-migrate, SQL); CI'de boş Postgres'te çalıştırılıyor (`ci.yml`)
- **Mevcut test:** CI adımı
- **Test önerisi (Öncelik 1):**
  1. Given boş DB → bütün migration'lar geçer (mevcut).
  2. Given migration'lar iki kez → idempotent.
  3. Given migrate:down/redo → hata yok (öneri).

**PLT-07 Health ve keep-alive**
- **Nerede:** GET `/health` → `{status:'ok'}` (`app.ts:55-57`); production'da 10 dk'da bir `https://api.atlasqrmenu.com/health` ping (`server.ts:44-51`, domain sabit kodlu)
- **Kurallar:** Health uç noktası DB ve Redis kontrolü yapmıyor.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given app → 200 ok.
  2. Öneri: `/health/deep` DB ve Redis ping yapsın; Given DB kapalı → 503.

**PLT-08 Tema sistemi**
- **Nerede:** `web/lib/theme.ts` (PNL-05), `web/lib/businessTheme.ts` (işletme renginden `--biz-*` değişkenleri), `web/lib/color.ts` (`isHexColor`, `normalizeHex`, `readableTextOn`), `apps/web/index.html` (açılış betiği, flash önleme)
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):** Given `#ffffff`, Then `readableTextOn` koyu döner; Given `#073f46`, Then açık döner. `businessThemeVars` kontrast ≥ 4.5.

**PLT-09 Request-ID, log ve hata yanıt biçimi**
- **Nerede:** `api/middleware/requestId.ts` (gelen `x-request-id` uzunluk sınırı olmadan kabul ediliyor), `requestLogger.ts`, `errorHandler.ts:51-55`, `notFoundHandler`
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):**
  1. Given x-request-id="abc" → yanıt header'ında aynı değer.
  2. Given bilinmeyen yol → 404 ve `{code:'NOT_FOUND', requestId}`.

**PLT-10 Public menü cache'i**
- **Nerede:** `api/services/menuService.ts:43-131` (anahtar `menu:{slug}`, TTL 60–120 sn); admin yazmalarında `invalidateBusinessMenuCache`
- **Kurallar:** Süper admin askıya alma ve kategori ekleme cache'i temizlemiyor.
- **Mevcut test:** `api/test/publicMenuCache.test.ts` (slug kapsamı, cache isabeti)
- **Test önerisi (Öncelik 2):** Given ürün PUT, Then `menu:{slug}` silinir; Given suspend, Then silinmeli (şu an silinmiyor).

**PLT-11 Ortam değişkeni doğrulama**
- **Nerede:** `api/config/env.ts:7-48` (zod; eksikse başlangıçta hata)
- **Mevcut test:** yok
- **Test önerisi (Öncelik 3):** Given `JWT_SECRET` 5 karakter → başlatma hatası.

**PLT-12 Metin temizleme (sanitizeText)**
- **Nerede:** `api/utils/sanitize.ts` (bütün tag'leri siler, sonra entity'leri geri çözer)
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):** Given "&lt;b&gt;" → "<b>" olarak saklanır. React güvenli, ama Excel ve mail tüketicilerinde risk var.

**PLT-13 Statik yüklemeler ve QR üretimi**
- **Nerede:** `/uploads` static (`app.ts:53`); GET `/api/admin/qr` (`adminRoutes.ts:259-302`)
- **Kurallar:** Serbest `content` parametresi ve `table_id` birlikte gönderilirse masanın `qr_url` değeri ilk seferde bu içerikle S3'e yazılıyor.
- **Mevcut test:** yok
- **Test önerisi (Öncelik 2):** Given `table_id` ve content="http://evil", Then `qr_url` değişmemeli.

**PLT-14 Mevcut testler ve CI (özet)**
- `authFlow.test.ts`: GIR-01, GIR-04, GIR-08, GIR-09 (servis mock'lu)
- `tenantIsolation.test.ts`: URN-01, URN-03 (`requireAuth` ve `pool` mock'lu, SQL metnine bağlı mock; kırılgan)
- `publicMenuCache.test.ts`: PLT-10
- `setup.ts`: logger mock
- Gerçek DB ile entegrasyon testi yok. CI'da Postgres ve Redis servisleri zaten ayağa kalkıyor (`ci.yml`), bu yüzden entegrasyon testleri doğrudan bu altyapıyı kullanabilir.

---

## "SİSTEM TESTLERİ" PANELİ — HATA KAYITLARI ALANINA ENTEGRASYON ÖNERİSİ

**Mevcut yapı**
- Rota: `web/App.tsx:80-81` (`/superadmin`, `/superadmin/errors`; `RequireAuth` yok, rol kontrolü sayfanın içinde).
- SuperAdminPage başlığında "Hatalar" düğmesi `SuperAdminPage.tsx:205`, mobil karşılığı `:226-229`.
- ErrorLogPage bölümleri: header `:191-227` → stat kartları `:232-260` → filtre paneli `:263-341` → masaüstü grid tablo `:344-418` → mobil kartlar `:421-472` → sayfalama `:475-489` → detay modalı `:493-626`.
- API istemcisi `web/api/errorLogApi.ts`, `apiRequest` ile çalışıyor (refresh ve 5xx raporu dahil).
- Backend `api/routes/errorLogRoutes.ts:101-106` (`requireAuth` + `requireSuperAdmin`), mount noktası `app.ts:89`.

**Önerilen entegrasyon**

1. **Rota ve gezinme**
   - `App.tsx` içine `/superadmin/tests` (`SystemTestsPage`) eklenir.
   - ErrorLogPage header'ına (`:215-224`) "Hata Logu | Sistem Testleri" segment düğmesi eklenir.
   - SuperAdminPage `:205` ve `:226` yanına "Testler" düğmesi eklenir.

2. **Backend**
   - Yeni `api/routes/systemTestRoutes.ts` dosyası; `app.ts:89`'un altına `app.use('/api/superadmin/system-tests', systemTestRoutes)` olarak bağlanır.
   - Koruma `errorLogRoutes.ts:105-106`'daki gibi `requireAuth` + `requireSuperAdmin` olmalı. `superAdminRoutes`'taki yalnızca JWT kontrol eden sürüm KULLANILMAMALI.
   - Uç noktalar:
     - GET `/catalog`: test vakaları (ID ör. GIR-01, seviye K1/K2/K3, açıklama)
     - POST `/runs` `{levels?:['K1'], ids?:[...]}` → 202 `{run_id}`
     - GET `/runs?limit&offset`: liste ve `total`
     - GET `/runs/:id`: vaka bazında sonuçlar
     - Opsiyonel: POST `/runs/:id/cancel`
   - Eşzamanlılık: Redis kilidi `SET systest:lock NX EX 600` (rateLimit'teki redis örneğiyle aynı). Kilit alınamazsa 409.
   - Çalıştırma modeli:
     - (a) Canlıda süreç içi "smoke" testleri: DB `SELECT 1`, Redis ping, pub/sub round-trip (`publishOrder` → geçici subscriber), S3 `PutObject` (ayrı test prefix'i), `menuService` cache set/del, migration sürümü kontrolü, tenant izolasyonu (ayrılmış `__systest` işletmesiyle oku/yaz/temizle), auth akışı (test kullanıcısıyla login → refresh → change-password geri al).
     - (b) Tam vitest paketi yalnızca CI'da çalışmalı. vitest bir devDependency, bu yüzden canlıda olmayabilir. Panelden GitHub `workflow_dispatch` tetiklenip sonuç webhook ya da poll ile alınabilir. `server.ts:16`'daki `execAsync` deseni canlıda vitest için önerilmez.
   - Kalıcılık: yeni migration `024_system_test_runs.sql`
     - `system_test_runs(id uuid pk, triggered_by uuid, levels text[], status text CHECK('queued','running','passed','failed','error'), started_at, finished_at, summary jsonb {passed, failed, skipped, duration_ms})`
     - `system_test_results(id, run_id fk ON DELETE CASCADE, case_id text, level text, status text CHECK('pass','fail','skip'), duration_ms int, message text, details jsonb)`
   - Hata kaydına köprü: başarısız vakalar için `logError({source:'backend', severity: K1 ise 'HIGH' değilse 'MEDIUM', message:'Sistem testi başarısız: GIR-01 …', fingerprint_extra:'systest:GIR-01'})`. Bunlar mevcut listeye düşer. `source='system_test'` istenirse `010` migration'ındaki `source CHECK` (satır 14) ve `errorLogRoutes.ts:144` whitelist'i güncellenmeli.

3. **Frontend (`SystemTestsPage`, ErrorLogPage'in iskeletini kullanarak)**
   - Header'a "Testleri Çalıştır" (`btn-primary`) ve seviye seçimi (K1/K2/K3 çipleri, ErrorLogPage filtre çiplerinin deseni) eklenir. Tetiklemeden önce ConfirmModal (tone='warning') gösterilir.
   - Stat kartları (`:232-260` grid deseni): son çalıştırma durumu, geçen/kalan, süre, son 7 günde başarısız çalıştırma sayısı.
   - Çalıştırma listesi (`:344-418` grid deseni): Tarih, Tetikleyen, Seviye, Durum rozeti (`STATUS_COLOR` benzeri: running/passed/failed), Geçen/Toplam, Süre.
   - Detay modalı (`:493-626` deseni): vaka tablosu (ID, ad, seviye, sonuç, süre), başarısızlar için mesaj ve `details` JSON'u (context pre bloğu deseni), "Hata kaydında aç" bağlantısı (`/superadmin/errors?search=GIR-01`).
   - Durum takibi: `running` iken 2 sn'de bir GET `/runs/:id`. Alternatif olarak süper admin SSE kanalı (`new_order:` yerine ayrı bir `systest` kanalı, `redisPubSub.subscribeChannel` ile).
   - API istemcisi `web/api/systemTestApi.ts` mutlaka `apiRequest` kullanmalı; `superadminApi`'deki çıplak `fetch` deseni refresh yapmıyor.

4. **Güvenlik**
   - Testler gerçek işletme verisine dokunmamalı.
   - Test kimlik bilgileri env'den gelmeli (`SYSTEST_EMAIL`/`SYSTEST_PASSWORD` gibi) ya da çalışma sırasında üretilip sonunda silinmeli.
   - Tetikleme rate-limit'li olmalı (ör. 1/dk).
   - `auth.ts` `requireAuth` + `requireSuperAdmin` zorunlu.

---

## RİSKLİ ALANLAR / OLASI REGRESYONLAR

1. **Ürün görseli ve açıklaması kaldırılamıyor.** UI `undefined` gönderiyor (`web/pages/ProductsPage.tsx:130`), sunucu `COALESCE` kullanıyor (`api/routes/adminRoutes.ts:556-557`). "Kaldır"a basılınca eski görsel geri geliyor.

2. **`thumb_url` hiç kaydedilmiyor.** Upload uç noktası döndürüyor (`adminRoutes.ts:415`), ama create ve update şemalarında alan yok (`:138-168`). Liste `thumb_url || image_url` kullanıyor (`ProductsPage.tsx:192`). Ayrıca eski S3 görselleri hiç silinmiyor (`api/services/uploadService.ts`).

3. **Ürün listesi 100 ile sınırlı.** UI sabit `page_size=100` istiyor ve sayfalama yok (`ProductsPage.tsx:56`, `AdminDashboardPage.tsx:115`, API max `adminRoutes.ts:135`).

4. **Kategori sıralaması atomik değil.** İki ayrı PUT ile yapılıyor (`web/pages/CategoriesPage.tsx:84-91`).

5. **Bekleyen sipariş sayacı çağrıları da sayıyor.** `pendingCount` type filtresi yapmıyor (`web/context/OrderContext.tsx:510`). Başlıkta "N sipariş" yanlış (`Layout.tsx:235-240`).

6. **Owner raporları:**
   - hourly ve daily "orders" sipariş değil kalem satırı sayıyor (`api/routes/ownerRoutes.ts:92`, `:113`).
   - Gün sınırı sunucu saatine göre (`:35-38`).
   - Ciroya indirim, ikram ve kalem iptalleri dahil edilmiyor (`:69-77`); doğrulanmalı.

7. **Süper admin `PUT /businesses/:id` doğrulamasız.**
   - Body ve id kontrol edilmiyor (`api/routes/superAdminRoutes.ts:126-133`).
   - Askıya alma menü cache'ini temizlemiyor (menü ≤120 sn açık kalır).
   - UI'da onay modalı yok (`SuperAdminPage.tsx:337`).

8. **Admin şifre sıfırlama birden fazla admin varsa hepsini değiştirip 404 döndürüyor** (`superAdminRoutes.ts:164-175`).

9. **Süper admin router'ı yalnızca JWT kontrol ediyor.** `password_version` ve `is_active` kontrolü yok (`superAdminRoutes.ts:27-43`).

10. **Bazı API istemcileri token yenilemiyor.** `superadminApi.ts:36-42`, `waiterAdminApi.ts:80-86` ve `ownerApi.ts:72-78` `apiRequest`'i atlıyor: 401'de yenileme yok, 5xx raporlaması yok, boş yanıtta `res.json()` hata atıyor. Sonuç: 15 dk sonra Süper Admin, Personel ve Owner sayfaları kırılıyor.

11. **Personel QR token'ı üçüncü tarafa gidiyor.** QR görseli için token `api.qrserver.com`'a gönderiliyor (`web/pages/WaitersPage.tsx:285-288`). WhatsApp mesajında işletme adı sabit 'AtlasQR' (`:692`).

12. **Şifre sıfırlama isteği hata metni sızdırıyor.** Mail hatasında 500 ve `String(error)` (`api/routes/authRoutes.ts:59-62`). UI hatayı yutuyor (`web/pages/ResetPage.tsx:21`).

13. **Sunucu tarafında logout yok, refresh rotation yok** (`api/services/authService.ts:92-120`). Her login önceki refresh'i geçersiz kılıyor (`:74-77`); sessionStorage'daki çok sekmeli kullanım bundan etkilenir.

14. **"Sipariş alımı kapalı" ayarı uygulanmıyor.** Yalnızca kaydediliyor (`web/pages/SettingsPage.tsx:438-441`; `customerOrderRoutes.ts` içinde kontrol yok).

15. **Logo upload DB'ye hemen yazıyor.** PUT'tan önce `logo_url` güncelleniyor (`adminRoutes.ts:438-442`); form kaydı başarısız olsa da logo değişmiş olur.

16. **Error ingest menü rate-limit kovasını paylaşıyor** (`api/routes/errorLogRoutes.ts:51`, `rateLimit.ts:64-68`). Bir hata fırtınası aynı NAT'taki müşterilerin menüsünü 429'a düşürebilir.

17. **sendBeacon CORS'a takılabilir.** JSON Blob cross-origin gönderiliyor (`web/lib/errorReporter.ts:79-80`).

18. **ErrorLogPage pasif filtre çiplerinin etiketi görünmüyor.** Yazı rengi = zemin rengi (`web/pages/superadmin/ErrorLogPage.tsx:294`, `:331`).

19. **Superadmin admin uç noktalarında 500 alıyor.** `businessId=''` oluyor (`api/middleware/auth.ts:65`) → uuid hatası → 500 ve HIGH error_log gürültüsü.

20. **Garson e-posta girişi işletmeler arası çakışabilir.** Arama global, benzersizlik işletme bazlı (`waiterService.ts:538-551` ile `:146-152`).

21. **Eski personel kayıtlarında `can_edit_other_tables` varsayılanı true** (`waiterService.ts:43`); yeni varsayılan false (`:31`). Yetki genişlemesi riski var.

22. **SSE kenar durumları:**
    - Refcount subscribe hatasında sızıyor (`api/db/redisPubSub.ts:23-31`).
    - Süresi dolmuş token ile 3 sn'de bir yeniden bağlanma döngüsü (`OrderContext.tsx:332-336`, `:482-485`).
    - Bağlantı başına `message` listener ekleniyor (`orderRoutes.ts:74`; çok bağlantıda MaxListeners uyarısı).

23. **Personel durumu değişince `staff_update` yayınlanmıyor** (`waiterService.ts:285-326`). Panel en geç 30 sn'lik yoklamayla güncelleniyor.

24. **Hata eşlemesi mesaj metnine bağlı.** `msg.includes('email'|'şifre'|'modülü')` (`api/routes/waiterAdminRoutes.ts:119-126`, `:195-199`); servis mesajı değişirse 500'e düşer.

25. **Testler kırılgan ve kapsam dar.** `tenantIsolation.test.ts:57` SQL metnine bağlı mock kullanıyor. Süper admin, owner, personel admin, hata kaydı, rate-limit ve SSE için hiç test yok. Web tarafında hiç test yok.

26. **`sanitizeText` entity'leri geri çözüyor** (`api/utils/sanitize.ts`). Excel ve mail gibi React dışı çıktılarda HTML enjeksiyonu riski var.

27. **Toast zamanlayıcı yarışı.** İlk zamanlayıcı ikinci toast'ı erken kapatıyor (`web/components/Toast.tsx:112-113`).

28. **QR uç noktası serbest içeriği kalıcı yazabiliyor.** `content` ve `table_id` birlikte gönderilirse masanın `qr_url`'i bu içerikle yazılıyor (`adminRoutes.ts:275-296`).

29. **pg_cron olmayan ortamlarda error_log hiç temizlenmiyor** (`migrations/011…sql:21-25`).

30. **Health uç noktası bağımlılıkları kontrol etmiyor; keep-alive domain'i sabit kodlu** (`app.ts:55-57`, `server.ts:47`).
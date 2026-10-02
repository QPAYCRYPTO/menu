# 03 — Mutfak ve admin Siparişler

> Özellik kataloğu · bölüm 3/5. Test katmanları: **K1** birim · **K2** API akış (gerçek veritabanı) · **K3** tarayıcı (E2E).



## Test katmanları
- **K1:** Unit testler. Saf fonksiyonlar ve servisler mock DB ile, ya da React bileşen/hook testi (RTL + vitest).
- **K2:** API entegrasyon testleri. supertest, gerçek Postgres ve Redis ile (`docker-compose.test.yml` mevcut). Redis pub/sub olay yakalama da bu katmanda.
- **K3:** E2E testler. Playwright ile çok sekmeli senaryolar: mutfak + admin + garson aynı anda.

## Mevcut test altyapısı
- API: `apps/api/vitest.config.ts` yalnızca `src/test/**/*.test.ts` dosyalarını içeriyor. Testler:
  - `apps/api/src/test/authFlow.test.ts`
  - `apps/api/src/test/publicMenuCache.test.ts`
  - `apps/api/src/test/tenantIsolation.test.ts` (yalnızca ürünleri kapsıyor)
- Mutfak, sipariş, değişiklik talebi, geçmiş ve SSE için **hiç test yok**.
- `apps/web/package.json` içinde test aracı yok (vitest, RTL, Playwright hiçbiri kurulu değil). Bu yüzden K1-UI ve K3 için önce altyapı kurulmalı.

## Rotalar ve bağlantılar
- `apps/api/src/app.ts:64` → `/api/admin/orders`
- `apps/api/src/app.ts:71` → `/api/admin/change-requests`
- `apps/api/src/app.ts:96` → `/api/kitchen`
- Web tarafı (`apps/web/src/App.tsx`):
  - `:79` → `/mutfak` (auth yok)
  - `:101` → `/admin` (`OrderProvider` ile sarılı)
  - `:115` → `orders`
  - `:117` → `kitchen`

## Olay (event) taşıma yolları
- **Admin:** `GET /api/admin/orders/stream` (`orderRoutes.ts:41-85`). Kanaldaki tüm olayları filtresiz iletir (`event: order`).
- **Mutfak:** `GET /api/kitchen/stream` (`kitchenRoutes.ts:190-259`). Olayları filtreler ve yalnızca `{type, order_id}` taşıyan `event: kitchen` ya da `event: revoked` gönderir.

---

# (A) MUTFAK

### MUT-001 — Mutfak linki token doğrulaması
**Ne yapar:** `/mutfak?t=<token>` şifresiz açılır, yetkiyi token verir. Token geçersizse, modül kapalıysa ya da işletme pasifse "Geçersiz link" ekranı görünür.

**Nerede:**
- UI: `KitchenScreenPage.tsx:122-125` (token yoksa doğrudan invalid), `:138-159` (`load`: 401 gelirse invalid), `:341-354` (geçersiz link ekranı).
- API:
  - `kitchenRoutes.ts:69-83` (`readKitchenToken`: önce `?t`, sonra `X-Kitchen-Token`; trim + lowercase)
  - `kitchenService.ts:77-91` (`resolveKitchenToken`: `/^[0-9a-f]{32}$/` + `kt.is_active` + `b.is_active` + `kitchen_module_enabled`)
  - Şema: `migrations/014_kitchen_module.sql:30-41` (CHECK regex, işletme başına tek aktif token için partial unique index)

**Kurallar:**
- 401 cevabı `KITCHEN_TOKEN_INVALID` kodu taşır.
- Büyük harfli token sunucuda küçültüldüğü için geçerli sayılır.
- Kalıp dışı token DB'ye hiç gitmeden null döner.
- Token query string'de taşınıyor ve `requestLogger` `originalUrl`'i logluyor. Sonuç: token loglara düşer.

**Mevcut test:** yok

**Test önerisi (K2 + K3):**
1. Given aktif token + modül açık, When `GET /api/kitchen/orders?t=TOKEN`, Then 200 ve body'de `business_name` ile `orders[]` var.
2. Given token büyük harfe çevrilmiş, When aynı istek, Then 200.
3. Given modül süper admin tarafından kapatılmış, When istek, Then 401 + `KITCHEN_TOKEN_INVALID`. UI'da "Geçersiz link".
4. Given `?t` yok, `X-Kitchen-Token` başlığı geçerli, Then 200.
5. Given `/mutfak` parametresiz açılıyor, Then fetch yapılmadan geçersiz link ekranı görünür (K3).

### MUT-002 — Mutfak sipariş listesi (`listKitchenOrders`)
**Ne yapar:** Bekleyen ve hazırlanan yemek siparişlerini eskiden yeniye listeler (çağrılar hariç). Her sipariş için günlük sipariş no, notlar, onay bekleyen talepler ve `kitchen_notice` döner.

**Nerede:**
- API: `GET /api/kitchen/orders` → `kitchenRoutes.ts:89-93`, `kitchenService.ts:95-146`
- UI: `KitchenScreenPage.tsx:416-530`

**Kurallar:**
- Filtre: `type='order'` AND (`status IN (pending, preparing)` OR (`cancelled` AND `kitchen_notice IS NOT NULL` AND `cancelled_at > NOW()-12h`)).
- `LIMIT 200`, sıralama `ORDER BY created_at ASC`.
- `order_no` = İstanbul gününe göre `ROW_NUMBER`. Yalnızca son 2 günün siparişleri numaralanır; daha eskiler 0 alır ve UI'da `#—` görünür (`:445`).
- `pending_changes`: `order_change_requests.status='pending'` olan talepler.
- `Cache-Control: no-store`.
- Başlıktaki sayaç iptal kartlarını saymaz (`:338`).
- Boş liste: "Bekleyen sipariş yok" (`:417-422`).

**Mevcut test:** yok

**Test önerisi (K2):**
1. Given pending, preparing, ready, delivered ve call kayıtları var, When liste istenir, Then yalnızca pending ve preparing siparişler, `created_at` artan sırada döner.
2. Given 6 saat önce iptal edilmiş, `kitchen_notice` dolu bir sipariş, Then listede `status:'cancelled'` olarak görünür. Given 13 saat önce iptal edilmiş, Then görünmez.
3. Given aynı gün 3 sipariş + 1 çağrı, Then `order_no` 1, 2, 3 olur (çağrı sayılmaz). Gün sınırı İstanbul saatine göre: 23:59 ve 00:01 siparişleri farklı günlere düşer.
4. Given B işletmesinin siparişi, When A'nın token'ıyla liste çekilir, Then B'nin siparişi görünmez (tenant izolasyonu).

### MUT-003 — SSE canlı akış ve olay filtreleme
**Ne yapar:** Mutfak, işletmenin Redis kanalını dinler. İlgili olay gelince listeyi 300 ms debounce ile yeniden çeker.

**Nerede:**
- API: `GET /api/kitchen/stream` → `kitchenRoutes.ts:177-188` (`KITCHEN_EVENT_TYPES`), `:221-242` (filtre), `:249-256` (15 sn'de bir ping + token yeniden doğrulama)
- UI: `KitchenScreenPage.tsx:180-214`, `:162-165` (`scheduleReload` 300 ms)

**Kurallar:**
- Kabul edilen olaylar: `new_order` (yalnızca `order_type==='order'`), `order_status`, `order_cancelled`, `order_items_added`, `order_items_updated`, `kitchen_order_ready`, `tables_changed`, `change_request`, `kitchen_notice_ack`, `kitchen_token_rotated` (özel işlenir).
- Gönderilen veri en aza indirilmiş: `{type, order_id}`.
- `order_cancelled`, `order_status` ve `change_request` olaylarında `order_type` filtresi **yok**. Bu yüzden çağrı iptali de mutfakta değişiklik sesi çaldırır.

**Mevcut test:** yok

**Test önerisi (K2 SSE istemcisi + K3):**
1. Given stream açık, When müşteri yemek siparişi verir (`new_order`, `order_type:'order'`), Then `event: kitchen` + `{type:'new_order'}` gelir.
2. Given stream açık, When müşteri çağrı yapar (`type:'call'`), Then mutfağa olay gitmez.
3. Given `staff_update` yayınlanır, Then iletilmez.
4. Given 5 olay 100 ms içinde gelir, Then UI yalnızca 1 kez `GET /orders` yapar (K1/K3, fake timers).
5. Given admin bir **çağrıyı** iptal eder, Then mutfağa `order_cancelled` gider ve değişiklik sesi çalar. Mevcut davranış bu; regresyon/karar testi olarak yazılmalı.

### MUT-004 — Link sıfırlanınca ekranın kapanması (revoke)
**Ne yapar:** Admin yeni token ürettiğinde eski linkle açık ekranlara `revoked` gider; yeni token'la bağlananlar etkilenmez. Modül kapatılırsa ping en geç 15 sn içinde keser.

**Nerede:**
- `kitchenRoutes.ts:55-63` (`POST /token` → `kitchen_token_rotated` yayını), `:231-240`, `:249-256`
- UI: `KitchenScreenPage.tsx:208-211`

**Kurallar:**
- Rotate işlemi transaction içinde ve işletme satırı `FOR UPDATE` ile kilitli (`kitchenService.ts:49-74`).
- Eski token `is_active=false` olur ama kaydı saklanır.

**Mevcut test:** yok

**Test önerisi (K2 + K3):**
1. Given token T1 ile açık stream, When `POST /api/kitchen/token`, Then T1 stream'i `event: revoked` alır ve kapanır. UI'da "Geçersiz link".
2. Given rotate sonrası T2 ile açık stream, When ikinci bir rotate olayı gelmediği sürece, Then T2 stream'i açık kalır.
3. Given modül kapatıldı, When ≤15 sn beklenir (fake timer), Then `revoked`.
4. Given eşzamanlı iki `POST /token`, Then DB'de tek aktif token kalır (unique index ihlali olmaz).

### MUT-005 — Çevrimdışı rozeti, son senkron saati, yedek yoklama, yeniden bağlanma
**Ne yapar:** Ağ ya da SSE koparsa "Çevrimdışı · son HH:MM" rozeti çıkar ve son liste ekranda kalır. Bağlantı dönünce liste yeniden yüklenir. SSE sessizce ölmüş olsa bile liste 30 sn'de bir yoklanır.

**Nerede:**
- `KitchenScreenPage.tsx:20` (`FALLBACK_POLL_MS=30000`), `:168-176`, `:185-197` (onopen/onerror), `:217-234` (online/offline/visibilitychange), `:387-400` (rozet)

**Kurallar:**
- `load` hata verirse `offline=true` olur ve liste korunur.
- `onopen` hata sonrası gelirse `load()` çağrılır.
- `online` olayı gelince `streamKey++` ile EventSource yeniden kurulur.
- Sekme görünür olunca `load()` çağrılır.
- `EventSource.CLOSED` olunca yalnızca `load()` çağrılır, stream yeniden kurulmaz (bkz. Riskler).

**Mevcut test:** yok

**Test önerisi (K3, Playwright offline modu + route mock):**
1. Given ekran açık, When ağ kesilir, Then "Çevrimdışı" + son senkron saati görünür ve kartlar kaybolmaz.
2. Given offline durum, When ağ geri gelir, Then "Canlı" rozeti döner, `GET /orders` çağrılır ve kopukken gelen sipariş görünür.
3. Given SSE olay iletmiyor (route stub), When 30 sn geçer, Then yeni sipariş yoklama ile görünür.
4. Given stream 500 dönüyor (EventSource CLOSED), When `/orders` 200 dönüyor, Then mevcut davranışta rozet "Canlı" gösteriyor ama stream yok. Bu, beklenen davranışı netleştirecek bir test olmalı.

### MUT-006 — Ses: "Sesi aç" bandı, yeni sipariş zili, değişiklik sesi
**Ne yapar:** Tarayıcı dokunuş olmadan ses çalmaz. Zil kapalıyken üstte nabız gibi atan bir "dokun" bandı ve başlıkta "Sesi aç" düğmesi görünür. Yeni siparişte 3 notalı ding-dong iki kez çalar; değişiklik olaylarında alçak tonlu kısa bir ses çalar.

**Nerede:**
- `KitchenScreenPage.tsx:63-115` (`getAudio`, `withAudio`, `playNewOrderSound`, `playChangeSound`)
- `:59` (`CHANGE_EVENTS` = `order_items_added`, `order_items_updated`, `order_cancelled`, `change_request`)
- `:198-207`, `:252-276` (`enableSound`, `statechange` takibi), `:366` (`onPointerDown`), `:381-386`, `:405-410`

**Kurallar:**
- Tek bir global `AudioContext` kullanılır.
- Bağlam askıya alınınca band yeniden görünür.
- Ses açılınca onay için kısa bir ses çalar.
- Ses kapalıyken çalma isteği `resume` denemesinden sonra sessizce düşer.

**Mevcut test:** yok

**Test önerisi (K1 AudioContext mock + K3):**
1. Given ses kapalı, Then band ve "Sesi aç" görünür. When ekrana dokunulur, Then `ctx.resume` çağrılır, band kaybolur ve kısa ses çalar.
2. Given ses açık, When `new_order` olayı gelir, Then 6 osilatör (3 nota × 2) oluşturulur.
3. Given `order_items_added` olayı, Then değişiklik sesi çalar. Given `order_status` olayı, Then ses çalmaz.
4. Given `AudioContext` `suspended` durumuna geçer (`statechange`), Then band tekrar görünür.

### MUT-007 — Ekranın kararmaması (Wake Lock)
**Ne yapar:** Destekleyen cihazlarda ekranın kararmasını engeller. Sekme tekrar görünür olunca kilit yeniden istenir.

**Nerede:** `KitchenScreenPage.tsx:237-250`

**Kurallar:**
- `navigator.wakeLock` yoksa sessizce atlanır.
- Unmount olunca kilit bırakılır.

**Mevcut test:** yok

**Test önerisi (K1, `navigator.wakeLock` mock):**
1. Given wakeLock var + sekme görünür, When mount, Then `request('screen')` çağrılır.
2. Given sekme gizlenip tekrar görünür olur, Then yeniden `request` çağrılır.
3. Given unmount, Then `release()` çağrılır.
4. Given wakeLock yok, Then hata oluşmaz.

### MUT-008 — Kartlar ve durum gösterimi (Bekliyor / Hazırlanıyor / İptal edildi)
**Ne yapar:** Her kartta masa adı, `#no`, durum rozeti, geçen dakika, notlar ve ürünler görünür. Kartın sol şeridi durumu gösterir: amber = bekliyor, mavi = hazırlanıyor, kırmızı = iptal.

**Nerede:** `KitchenScreenPage.tsx:425-528`

**Kurallar:**
- İptal edilen kartta ürünler üstü çizili gösterilir ve eylem düğmesi yoktur (`:513`).
- Pending kartta "Hazırlanıyor →", preparing kartta "Hazır ✓" düğmesi var.
- Tema: `ThemeToggle` + `useThemedPage` (`:136`, `:401`).

**Mevcut test:** yok

**Test önerisi (K1 render + K3):**
1. Given pending sipariş, Then amber şerit, "Bekliyor" rozeti ve "Hazırlanıyor" düğmesi görünür.
2. Given preparing sipariş, Then mavi şerit ve "Hazır" düğmesi görünür.
3. Given cancelled + notice dolu sipariş, Then "İptal edildi" rozeti, üstü çizili ürünler var, eylem düğmesi yok.
4. Given tema değiştirilir, Then sayfa teması değişir ve sayfa yenilense de korunur.

### MUT-009 — "Hazırlanıyor" (start) eylemi: iyimser UI ve geri alma
**Ne yapar:** Kart anında maviye döner, ardından `PATCH /start` gönderilir.
- Ağ ya da 5xx hatasında kart eski haline döner, offline rozeti ve 5 sn'lik hata mesajı çıkar.
- 409 gelirse liste tazelenir.

**Nerede:**
- UI: `KitchenScreenPage.tsx:279-312`
- API: `PATCH /api/kitchen/orders/:id/start` → `kitchenRoutes.ts:95-123`, `kitchenService.ts:160-172`

**Kurallar:**
- UUID değilse 400.
- Yalnızca `status='pending'` AND `type='order'` AND aynı işletme ise güncellenir; aksi halde 409 `ORDER_NOT_PENDING`.
- `preparing_at = COALESCE(preparing_at, NOW())`.
- Yayın: `order_status` `{status:'preparing', order_type:'order'}`. Tüketiciler:
  - admin `OrderContext.tsx:420-430` → kart durumu güncellenir
  - garson `WaiterCallsContext.tsx:293`
  - mutfak → yeniden yükleme
- `busyIds` çift tıklamayı engeller.
- 401 gelirse ekran invalid'e döner.

**Mevcut test:** yok

**Test önerisi (K2 + K3):**
1. Given pending sipariş, When `PATCH start`, Then 200, DB'de `status=preparing` ve `preparing_at` dolu, Redis'e `order_status` yayınlanır.
2. Given zaten preparing, When `PATCH start`, Then 409 `ORDER_NOT_PENDING`.
3. Given başka işletmenin sipariş id'si, Then 409 (sızıntı yok).
4. Given ağ hatası (K3 route abort), When "Hazırlanıyor" tıklanır, Then kart önce maviye döner, sonra amber'e geri döner ve "işaretlenemedi" mesajı 5 sn görünür.
5. **Realtime:** Given admin `/admin/orders` açık, When mutfak start der, Then admin kartı SSE ile ≤1 sn içinde "Hazırlanıyor" olur.

### MUT-010 — "Hazır" (ready) eylemi
**Ne yapar:** Kart iyimser şekilde hemen kaldırılır. Garsona `kitchen_order_ready` (ürün özetiyle) ve herkese `order_status: ready` gider.

**Nerede:**
- UI: `KitchenScreenPage.tsx:280-287`
- API: `PATCH /api/kitchen/orders/:id/ready` → `kitchenRoutes.ts:139-174`, `kitchenService.ts:176-199`

**Kurallar:**
- `pending → ready` doğrudan da mümkün: SQL `status IN ('pending','preparing')`. UI bunu sunmuyor ama API izin veriyor.
- `ready_at` COALESCE ile set edilir.
- `kitchen_notice` **temizlenmez** (bkz. Riskler).
- Tüketiciler:
  - garson `WaiterCallsContext.tsx:278` (toast + ses)
  - admin `OrderContext.tsx:432-438` → status ready

**Mevcut test:** yok

**Test önerisi (K2 + K3):**
1. Given preparing sipariş, When `PATCH ready`, Then 200, `ready_at` dolu, iki olay yayınlanır (sıra: `kitchen_order_ready`, sonra `order_status`), `items` alanında ad ve adet var.
2. Given pending sipariş, When `PATCH ready`, Then 200 (atlama izni; belgelenmeli).
3. Given iki mutfak ekranı, When biri "Hazır" der, Then diğerinde kart SSE + reload ile kaybolur. İkinci ekran aynı anda tıklarsa 409 alır ve `load()` çağrılır.
4. **Realtime:** Given admin + garson ekranları açık, When "Hazır", Then admin kartı "Hazır" olur ve "Teslim Edildi" düğmesi çıkar; garsonda "Mutfaktan hazır" toast'ı görünür.

### MUT-011 — Geç kalma vurgusu (10 dk)
**Ne yapar:** Oluşturulmasından bu yana ≥10 dk geçen ve iptal edilmemiş kartın çerçevesi ve başlığı kırmızıya döner. Saat 15 sn'de bir güncellenir.

**Nerede:** `KitchenScreenPage.tsx:21` (`LATE_MINUTES=10`), `:117-119`, `:171`, `:426-428`, `:437`, `:441`, `:454`

**Kurallar:**
- Süre `created_at`'ten hesaplanır, `preparing_at`'ten değil.
- Kart yanıp sönüyorsa çerçeve rengini blink rengi ezer.
- Gelecek tarihli saat 0'a kırpılır ve "şimdi" yazar.

**Mevcut test:** yok

**Test önerisi (K1, fake timers):**
1. Given `created_at` 9 dk önce, Then normal görünüm. When 60 sn ilerler (≥10 dk), Then kırmızı çerçeve ve "10 dk".
2. Given cancelled + 30 dk, Then geç kalma vurgusu yok.
3. Given geç kalmış + notice dolu, Then çerçeve rengi blink rengidir.

### MUT-012 — Notlar (genel not ve ürün notu)
**Ne yapar:** Sipariş notu sarı "NOT" bloğunda, ürün notu ilgili ürün satırının altında gösterilir.

**Nerede:** `KitchenScreenPage.tsx:489-494`, `:503-507`. Veri `kitchenService.ts:106-109`'dan gelir.

**Kurallar:** Yalnızca boşluktan oluşan notlar gösterilmez.

**Mevcut test:** yok

**Test önerisi (K1):**
1. Given `note="  "`, Then NOT bloğu yok.
2. Given ürün notu "acısız", Then ürünün altında görünür.
3. Given uzun not, Then `break-words` ile taşmaz.

### MUT-013 — Onay bekleyen talepler ("ONAY BEKLİYOR")
**Ne yapar:** Personelin iade / iptal / adet azaltma talebi admin onayı beklerken mutfak kartında kırmızı uyarı bloğu çıkar.

**Nerede:**
- `KitchenScreenPage.tsx:476-487`
- `kitchenService.ts:126-145`
- Talep oluşturma: `changeRequestService.ts:58-215`

**Kurallar:**
- Metinler:
  - `order_cancel` → "İade talebi var — bekletin"
  - `items_cancel` → "İptal talebi: 2× X — bekletin"
  - `item_decrease` → "X → N adet talebi"
- Karar verilince talep `pending` olmaktan çıkar ve blok kaybolur. Mutfağa `change_request` olayı ile reload gider.

**Mevcut test:** yok

**Test önerisi (K2 + K3):**
1. Given preparing sipariş, When garson (iade yetkisi yok) `items_cancel` talebi gönderir, Then mutfak listesinde `pending_changes[0].kind='items_cancel'` olur ve kartta "ONAY BEKLİYOR" görünür.
2. When admin reddeder, Then blok kalkar ve `kitchen_notice`'e "İptal talebi reddedildi — hazırlamaya devam" eklenir.
3. Given `item_decrease` talebi, Then kartta "X → 1 adet talebi" yazar.

### MUT-014 — `kitchen_notice`: yanıp sönme ve "Gördüm" onayı
**Ne yapar:** Ekleme, adet değişikliği, iptal ve iptal talebi gibi değişiklikler `orders.kitchen_notice` alanına eklenir. Kart, ton rengiyle yanıp söner ve "DEĞİŞİKLİK" listesi gösterilir. "Gördüm" bildirimi temizler.

**Nerede:**
- UI: `KitchenScreenPage.tsx:44-56` (renk önceliği: cancel > request > edit > info), `:430-440`, `:459-474`, `:315-336` (`acknowledge`: iyimser + geri alma)
- CSS: `index.css:268-275` (`kitchen-blink`; reduced-motion durumunda sabit gölge)
- API:
  - `POST /api/kitchen/orders/:id/ack` → `kitchenRoutes.ts:126-137`, `kitchenService.ts:149-157`
  - Ekleme: `itemCancellationService.ts:34-46`
- `addKitchenNotice` kullanıldığı yerler:
  - `itemCancellationService.ts:76` (tüm sipariş iptali, önceki durum pending/preparing ise)
  - `itemCancellationService.ts:186` (ürün iptali; pending'de 'edit', preparing'de 'cancel' tonu)
  - `changeRequestService.ts:82`, `:152` (talep: 'request')
  - `changeRequestService.ts:324` (`item_decrease` onayı: 'cancel')
  - `changeRequestService.ts:330` (red veya geçersiz: 'info')
  - `waiterPublicRoutes.ts:1056` (ürün ekleme: 'edit'; yalnızca pending'de mümkün)
  - `waiterPublicRoutes.ts:1150` (adet değişikliği: 'edit')

**Kurallar:**
- Ack koşulsuz 200 döner. `UPDATE` yalnızca `kitchen_notice IS NOT NULL` ise satır etkiler.
- Ack her durumda `kitchen_notice_ack` olayı yayınlar. Tüketiciler:
  - diğer mutfak ekranları → reload
  - admin `OrderContext.tsx:376-379` → `acknowledgeUpdate` + `refetchOrders`

**Mevcut test:** yok

**Test önerisi (K2 + K3):**
1. Given pending sipariş, When garson ürün ekler, Then `kitchen_notice=[{tone:'edit', text:'Eklendi: 1× X'}]` olur. Mutfak kartı amber yanıp söner ve değişiklik sesi çalar.
2. Given notice dolu, When mutfak "Gördüm" der, Then 200, DB'de `kitchen_notice=NULL` ve `kitchen_notice_at=NULL`, Redis'e `kitchen_notice_ack` yayınlanır, kart yanıp sönmeyi bırakır.
3. **Realtime:** Given admin kartında "GÜNCELLEME" paneli var, When mutfak "Gördüm" der, Then admin paneli SSE ile ≤1 sn içinde kaybolur ve güncelleme sayacı azalır.
4. Given ack ağ hatası alır, Then notice geri gelir ve offline rozeti çıkar.
5. Given notice satırlarında hem 'cancel' hem 'edit' var, Then blink rengi kırmızıdır (öncelik kuralı, K1).

### MUT-015 — İptal kartının "Gördüm"e kadar ekranda kalması
**Ne yapar:** Mutfak başlamadan önce ya da hazırlanırken iptal edilen sipariş üstü çizili halde ekranda kalır. "Gördüm" denince kaldırılır.

**Nerede:**
- `kitchenService.ts:119-120`
- `itemCancellationService.ts:75-77`
- `KitchenScreenPage.tsx:317-319`

**Kurallar:**
- Notice yalnızca `previousStatus ∈ {pending, preparing}` ise yazılır.
- Şu iptal yollarında notice **yazılmaz**, kart sessizce düşer:
  - `sessionRoutes.ts:229-239` (`cancel_pending`)
  - `paymentService.ts:258-269` (kapanışta açık sipariş kararı)

**Mevcut test:** yok

**Test önerisi (K2 + K3):**
1. Given preparing sipariş, When admin `POST /admin/orders/:id/cancel`, Then mutfakta "İptal edildi" kartı kalır. When "Gördüm", Then kart kaybolur ve tekrar gelmez.
2. Given iptal edilen sipariş, When 12 saat geçer, Then listeden düşer.
3. Given masa `cancel_pending` ile kapatıldı, Then mevcut davranışta mutfak kartı "Gördüm" sormadan düşer (tutarsızlık; karar testi).
4. Given iki mutfak ekranı, When biri "Gördüm" der, Then diğerinde de kart `kitchen_notice_ack` ile kalkar.

### MUT-016 — Admin Mutfak sayfası: link oluşturma, kopyalama, açma, sıfırlama
**Ne yapar:** Admin mutfak linkini oluşturur, kopyalar ya da yeni sekmede açar. Sıfırlama onay modalı ister ve eski link anında geçersiz olur.

**Nerede:**
- UI: `KitchenPage.tsx:15-17` (`kitchenLink` = `VITE_PUBLIC_BASE_URL/mutfak?t=`), `:32-38`, `:40-53`, `:55-63`, `:65-72`, `:101-136`
- API:
  - `GET /api/kitchen/token` → `kitchenRoutes.ts:48-53`
  - `POST /api/kitchen/token` → `:55-63`
  - Yetki: `requireAuth` + `requireRole('admin','owner')` (`:33`)
  - Modül kontrolü: `:35-46` (403 `KITCHEN_MODULE_DISABLED`)

**Kurallar:**
- İlk oluşturma onay istemez; sıfırlama `ConfirmModal` ile onay ister.
- Toast metinleri: "Mutfak linki oluşturuldu." / "Link sıfırlandı. Eski link artık çalışmaz."
- Kopyalama başarısız olursa hata toast'ı çıkar.

**Mevcut test:** yok

**Test önerisi (K2 + K3):**
1. Given modül açık + token yok, When `GET /token`, Then `{token:null}`. When `POST`, Then 201 + 32 karakter hex token. UI'da link gösterilir.
2. Given token var, When "Linki Sıfırla" → onay, Then token değişir. Eski linkle açık mutfak sekmesi "Geçersiz link"e düşer (K3, iki sekme).
3. Given modül kapalı, When `GET /token`, Then 403 `KITCHEN_MODULE_DISABLED` ve sayfada hata kutusu.
4. Given garson token'ı ya da yetkisiz rol, Then 403. Given owner rolü, Then 201. Bu, mevcut "owner yalnızca okur" ilkesiyle çelişiyor (karar testi).

### MUT-017 — Modül bayrağı ve menü görünürlüğü
**Ne yapar:** "Mutfak" menü sekmesi yalnızca `kitchen_module_enabled` açıksa görünür. Bayrak pencere odağı geri gelince tazelenir. Bayrağı süper admin açıp kapatır.

**Nerede:**
- `Layout.tsx:23-48` (`useModuleFlags`, `/admin/business`), `:113-116`, `:122`
- `SuperAdminPage.tsx:151-156`
- `superadminApi.ts:175-180` (`PATCH .../kitchen-module`)
- Migration `014`

**Kurallar:**
- Bayrak bilinmezken sekme gizli.
- `/admin/kitchen` rotası UI'da korumasız; doğrudan URL ile açılırsa API 403 döner ve hata gösterilir.
- Bayrak değişince yayın yapılmaz; mutfak stream'i ping ile en geç 15 sn içinde kesilir.

**Mevcut test:** yok

**Test önerisi (K2 + K3):**
1. Given bayrak kapalı, Then menüde "Mutfak" yok. When `/admin/kitchen` doğrudan açılır, Then hata kutusu görünür.
2. Given süper admin bayrağı açar, When admin sekmesine odak döner, Then "Mutfak" menüde görünür.
3. Given açık mutfak ekranı, When bayrak kapatılır, Then ≤15 sn içinde "Geçersiz link".

---

# (B) ADMİN SİPARİŞLER

### SİP-001 — Aktif sipariş listesi (`GET /admin/orders`)
**Ne yapar:** Teslim edilmemiş ve iptal edilmemiş sipariş ve çağrıları, kalemleri, garson adı, `kitchen_notice` ve `cancellations` ile birlikte döner.

**Nerede:**
- API: `orderRoutes.ts:151-198`
- `itemCancellationService.ts:213-231` (`listCancellations`)
- UI: `OrderContext.tsx:304-310` (ilk yükleme), `:232-239` (`refreshActive`)

**Kurallar:**
- `?status=` verilirse o durum filtrelenir; değer doğrulanmıyor ama parametreli sorgu kullanılıyor.
- Verilmezse `NOT IN (delivered, cancelled)`.
- `ORDER BY created_at DESC LIMIT 100`.
- Yetki: `requireAuth` + `requireAdmin` (admin, superadmin; owner hariç).

**Mevcut test:** yok

**Test önerisi (K2):**
1. Given pending, ready, delivered, cancelled siparişler + bir çağrı, Then yanıtta yalnızca pending, ready ve çağrı var.
2. Given preparing sonrası ürün iptali yapılmış sipariş, Then `cancellations[]` dolu ve `kitchen_notice` alanı dönüyor.
3. Given owner token, Then 403. Given B işletmesinin admini, Then A'nın siparişleri görünmez.
4. Given 120 aktif kayıt, Then en yeni 100 döner (en eski 20 kaybolur; risk belgelenmeli).

### SİP-002 — Sipariş kartı (OrderCard)
**Ne yapar:** Masa, tarih/saat/önce, durum rozeti, kaynak (personel adı ya da "Müşteri"), canlı süre sayacı, ürünler + ürün notları, genel not ve toplam tutarı gösterir.

**Nerede:** `OrdersPage.tsx:341-468`. Yardımcılar:
- `:98-115` (`OrderSourceBadge`)
- `:117-127` (`OrderTimeRow`)
- `:129-161` (sayaç: pending/preparing/ready canlı, delivered/cancelled statik)
- `:95-96` (TL formatı, toplam)

**Kurallar:**
- Toplam = Σ `price_int × quantity` / 100.
- Pending kartın çerçevesi amber.
- Güncelleme varsa çerçeve 2px amber ve `pulse-update` animasyonu.

**Mevcut test:** yok

**Test önerisi (K1):**
1. Given 2× 125,00 + 1× 50,00, Then "Toplam 300.00 TL".
2. Given `waiter_name='Ayşe'`, Then "Ayşe" rozeti. Given `waiter_name` null, Then "Müşteri" rozeti.
3. Given `created_at` 65 sn önce, Then sayaç "1:05" gösterir ve her saniye artar.

### SİP-003 — Durum düğmeleri (Hazırlanıyor → Hazır → Teslim Edildi)
**Ne yapar:** Admin siparişi ileri taşır. Teslim edilen kart listeden iyimser şekilde kalkar. Hata olursa liste yeniden çekilir ve hata toast'ı çıkar.

**Nerede:**
- UI: `OrdersPage.tsx:440-465`, `:581-588`, `OrderContext.tsx:258-279`
- API: `PUT /api/admin/orders/:id` → `orderRoutes.ts:201-308`

**Kurallar:**
- Body enum: `pending | preparing | ready | delivered`.
- `cancelled` siparişte 409.
- API geri yönlü geçişlere de izin veriyor (ör. `delivered → pending`). Bu durumda `delivered_at` NULL'lanır ve session toplamı düşürülür.
- Teslime geçişte `incrementSessionTotal`, teslimden çıkışta `decrementSessionTotal` çağrılır.
- `preparing_at` ve `ready_at` COALESCE ile set edilir.
- Yayınlar:
  - `order_status`
  - çağrı + delivered ise ek olarak `call_taken`
- Admin "Hazır" dediğinde `kitchen_order_ready` **yayınlanmaz**, garson hazır bildirimi almaz.
- `:id` UUID olarak doğrulanmıyor.

**Mevcut test:** yok

**Test önerisi (K2 + K3):**
1. Given oturuma bağlı ready sipariş (toplam 300), When PUT `delivered`, Then `delivered_at` dolu ve `session.cached_total` +300. When PUT `ready`, Then `delivered_at` NULL ve toplam −300.
2. Given cancelled sipariş, When PUT, Then 409.
3. Given geçersiz status ya da id, Then 400 (id için mevcut davranış muhtemelen 500; bkz. Riskler).
4. **Realtime:** Given mutfak ekranı açık, When admin pending kartta "Hazırlanıyor" der, Then mutfak kartı ≤1 sn içinde maviye döner (`order_status` → reload).
5. Given iki admin sekmesi, When biri "Teslim Edildi" der, Then diğerinde kart SSE ile kalkar.

### SİP-004 — Çağrı kartları (garson, hesap ve diğer çağrılar)
**Ne yapar:** Pending çağrılar ayrı bir bölümde, türüne göre ikon ve etiketle gösterilir. Kritik türler ("Masa Silinsin", "Servis Eksik") kırmızıdır ve başlıkta "N acil" sayacı çıkar. "Diğer" türünde müşteri açıklaması gösterilir. "İlgilendim" çağrıyı kapatır.

**Nerede:**
- `OrdersPage.tsx:470-541`, `:612`, `:619-622`, `:674-689`
- `lib/callTypes.ts` ("bill" = "Hesap", `critical` bayrakları)
- API: aynı `PUT` (`delivered`) → `call_taken` yayını (`orderRoutes.ts:294-296`)

**Kurallar:**
- İlgilendim → `updateOrderStatus(delivered)` ile iyimser kaldırma.
- Garson "İlgilendim" derse (`waiterPublicRoutes.ts:545` `call_taken`), admin'den anında silinir (`OrderContext.tsx:405-411`).
- Çağrılar arama filtresine dahil değil.
- Yeni çağrı sesi `playCallSound`.

**Mevcut test:** yok

**Test önerisi (K2 + K3):**
1. Given müşteri "Hesap" çağrısı yapar, Then admin'de "Hesap" etiketli çağrı kartı ve çağrı sesi.
2. Given "clean_table" çağrısı, Then kırmızı "Acil İstek" ve "1 acil" sayacı.
3. When admin "İlgilendim", Then 200, `call_taken` yayınlanır ve garson listesinden de düşer.
4. **Realtime:** Given garson "İlgilendim" der, Then admin kartı ≤1 sn içinde kaybolur.
5. Given `call_type='other'` + not, Then "Müşteri Açıklaması" bloğu görünür.

### SİP-005 — İptal modalı ve sebepleri
**Ne yapar:** 7 sebepten biri seçilir; "Diğer" seçilirse en az 3 karakter açıklama zorunludur. Açıklama en fazla 500 karakter.

**Nerede:**
- UI: `OrdersPage.tsx:24-32`, `:228-327`, `:590-594`, `OrderContext.tsx:281-302`
- API: `POST /api/admin/orders/:id/cancel` → `orderRoutes.ts:18-34`, `:311-412`

**Kurallar:**
- `cancel_reason` = `"code: text"` ya da yalnızca `code`.
- Zaten iptalse 409.
- `recordWholeOrderCancellation` (`itemCancellationService.ts:52-78`):
  - önceki durum pending değilse kalemler `order_item_cancellations`'a `whole_order=TRUE` ile yazılır
  - önceki durum pending veya preparing ise mutfağa "SİPARİŞ İPTAL EDİLDİ" notice'i eklenir
- Teslim edilmiş sipariş iptal edilirse ve oturumu varsa `decrementSessionTotal`.
- Yayın: `order_cancelled`. Tüketiciler:
  - admin → kart kaldırma
  - mutfak → reload + ses
  - garson
- UI iyimser kaldırır; hata olursa `refreshActive` çağrılır ve hata modalda gösterilir.

**Mevcut test:** yok

**Test önerisi (K1 + K2 + K3):**
1. Given "Diğer" seçili + "ab", Then "İptal Et" düğmesi pasif. Given "abc", Then aktif (K1).
2. Given API'ye `reason_code:'other'` + boş metin, Then 400 ve ilgili Türkçe mesaj (K2).
3. Given preparing sipariş, When iptal, Then `order_item_cancellations` satırları `whole_order=true` ve `order_status='preparing'` ile yazılır, `kitchen_notice` 'cancel' satırı içerir (K2).
4. Given oturuma bağlı delivered sipariş (300), When iptal, Then `session.cached_total` −300 (K2).
5. **Realtime:** Given mutfak ekranı açık, When admin preparing siparişi iptal eder, Then mutfakta kart "İptal edildi" olur, yanıp söner ve ses çalar (K3).

### SİP-006 — Aktif arama
**Ne yapar:** Masa ya da ürün adında, Türkçe locale ile küçük harfe çevrilerek arama yapılır. Yalnızca yemek siparişlerini filtreler.

**Nerede:** `OrdersPage.tsx:557`, `:613-616`, `:666-672`, `:702-710`

**Kurallar:**
- Arama kutusu yalnızca en az bir yemek siparişi varken görünür.
- Sonuç boşsa "Aramaya uyan aktif sipariş yok" yazar.
- Çağrılar filtrelenmez.

**Mevcut test:** yok

**Test önerisi (K1):**
1. Given "İskender" ürünü, When "iskender" aranır, Then bulunur (tr locale).
2. Given "Bahçe 3" masası, When "bahçe" aranır, Then yalnızca o kart görünür.
3. Given eşleşme yok ama çağrı var, Then çağrı kartı yine görünür.

### SİP-007 — "GÜNCELLEME" paneli (pendingUpdates) ve mutfak "Gördüm" ile senkronu
**Ne yapar:** Garson ürün ekleyince ya da adet değiştirince kartta amber "GÜNCELLEME" paneli açılır: kim yaptı, EKLENDİ / ADET / KALDIRILDI satırları. Başlıkta "N güncelleme" rozeti görünür. Panel iki şekilde kapanır:
- admin "Gördüm" der (yalnızca yerel; mutfağa iletilmez)
- mutfak "Gördüm" der (`kitchen_notice_ack` ya da yeniden çekme sırasında budama)

**Nerede:**
- UI: `OrdersPage.tsx:163-220`, `:392`, `:617`, `:643-646`, `:697-698`
- Context: `OrderContext.tsx:163-199` (`addUpdate`: değişiklikler biriktirilir), `:214-230` (`applyOrders`: sipariş artık aktif değilse ya da (pending/preparing && `!kitchen_notice`) ise silinir), `:376-379`, `:440-466`, `:262-264`, `:289-290`, `:405-418`

**Kurallar:**
- Kaynak olaylar:
  - `order_items_added` (`waiterPublicRoutes.ts:1061`)
  - `order_items_updated` (`waiterPublicRoutes.ts:1176`, `:1458`, `changeRequestService.ts:357`, `:362`)
- `pendingUpdates` yalnızca bellekte tutulur. Sayfa yenilenince kaybolur; sunucudaki `kitchen_notice` buradan yeniden kurulmaz.
- Budama yalnızca `refetchOrders` ve `refreshActive` içinde yapılır. İlk yükleme (`:309`), 60 sn senkron (`:494`) ve `new_order` yedek yolu (`:398`) `setActiveOrders` kullanır ve budama yapmaz.
- Ready durumdaki siparişlerde mutfak notice'i göremez, bu yüzden budama olmaz.

**Mevcut test:** yok

**Test önerisi (K1 reducer + K3 realtime):**
1. Given pending sipariş, When garson 1× Ayran ekler, Then admin kartında "GÜNCELLEME · Ayşe · EKLENDİ Ayran ×1" paneli, başlıkta "1 güncelleme" ve güncelleme sesi.
2. **Realtime:** Given panel açık, When mutfak "Gördüm" der, Then admin paneli ≤1 sn içinde kalkar ve sayaç 0 olur.
3. **Yenile düğmesi:** Given admin SSE'si koparılmış (route abort) ve mutfak "Gördüm" demiş, When admin "Yenile" düğmesine basar, Then `refreshActive` → `applyOrders` paneli kaldırır.
4. Given admin "Gördüm" der, Then panel kalkar ama mutfak kartı yanıp sönmeye devam eder (tek yönlü senkron; belgelenmeli).
5. Given aynı siparişe iki ekleme, Then değişiklikler birleşir. When sipariş teslim edilir, Then panel kalkar.

### SİP-008 — Değişiklik talebi onay/red (kart üzerinde)
**Ne yapar:** Kartın üstündeki "Onay bekliyor" bloğunda personel talebi gösterilir: kim, ne istedi. Admin Onayla ya da Reddet der, ardından toast ile sonuç mesajı çıkar.

**Nerede:**
- UI: `OrdersPage.tsx:363-371`, `:567-574`, `:694-696`, `ChangeRequestItem.tsx:1-40`
- `lib/changeRequests.ts:41-97` (`describeRequest`, `useChangeRequests`: 30 sn yoklama + `atlasqr:change-request` window olayı, `decide` sonrası `load`)
- API:
  - `GET /api/admin/change-requests` → `changeRequestRoutes.ts:18-22`
  - `POST /:id/approve` ve `POST /:id/reject` → `:24-52`
  - `changeRequestService.ts:218-239` (yalnızca açık siparişlerin bekleyen talepleri), `:242-379` (`decideRequest`)

**Kurallar:**
- `FOR UPDATE OF r, o` ile kilitlenir. Zaten sonuçlanmış talep 409 `ALREADY_DECIDED` döner.
- Onay kararı, sipariş kapanmışsa ya da kalem uygulanamıyorsa `void` olur. `items_cancel`'da `AppError` gelirse SAVEPOINT'e geri dönülür ve sonuç `void` olur.
- `order_cancel` onayı: sipariş cancelled olur, `recordWholeOrderCancellation` çağrılır, diğer bekleyen talepler `void` yapılır.
- `item_decrease` onayı: adet güncellenir ve `order_item_cancellations` kaydı yazılır.
- Mutfak notice'leri: onayda 'cancel', red veya void'de 'info' ("İptal talebi reddedildi — hazırlamaya devam").
- Yayınlar:
  - `order_cancelled` (tüm sipariş iptali)
  - ya da `order_items_updated`
  - her durumda `change_request` `{action:'decided'}`
- Mesajlar: "İade onaylandı, sipariş iptal edildi." / "İptal onaylandı, seçilen ürünler iptal edildi." / "İade onaylandı, adet güncellendi." / "Talep reddedildi." / "Sipariş bu arada değiştiği için talep geçersiz sayıldı."

**Mevcut test:** yok

**Test önerisi (K2 + K3):**
1. Given preparing + `order_cancel` talebi, When approve, Then sipariş cancelled, `whole_order` kayıtları yazılır, diğer pending talepler `void` olur, `order_cancelled` + `change_request` yayınlanır.
2. Given aynı talep, When ikinci approve, Then 409 `ALREADY_DECIDED`.
3. Given `item_decrease` (3→1) talebi ama kalem bu arada 1'e inmiş, When approve, Then sonuç `void` ve "geçersiz sayıldı" mesajı.
4. Given `items_cancel` tüm kalemleri kapsıyor, When approve, Then sipariş bütünüyle iptal olur ve mutfakta "SİPARİŞ İPTAL EDİLDİ" görünür.
5. **Realtime:** Given admin iki sekmede açık, When birinde reddedilir, Then diğerinde blok `change_request` olayı → `load` ile kalkar. Mutfakta "ONAY BEKLİYOR" bloğu kalkar ve 'info' notice'i yanıp söner.

### SİP-009 — İptal edilen ürünler bloğu (CancelledItems)
**Ne yapar:** Mutfak başladıktan sonra iptal edilen kalemleri listeler: ürün, adet, tutar, sebep, kim, onaylayan, saat ve aşama ("hazırlanırken" / "hazırken" / "teslimden sonra").

**Nerede:**
- `components/orders/CancelledItems.tsx:1-65`
- Aktif kart: `OrdersPage.tsx:423`
- Geçmiş detayı: `OrderHistory.tsx:442`, `:459-461`
- Veri: `orderRoutes.ts:196-197`, `orderHistoryService.ts:161-168`

**Kurallar:**
- Liste boşsa bileşen hiç render edilmez.
- Pending aşamasında yapılan düzeltmeler kayda yazılmaz (`itemCancellationService.ts:135-151`).

**Mevcut test:** yok

**Test önerisi (K1 + K2):**
1. Given preparing iken 1× X iptal edilmiş (sebep `out_of_stock`, kişi Ayşe), Then "1× X · Stok yok · Ayşe · HH:MM · hazırlanırken".
2. Given admin onaylı kayıt, Then "(onay: admin@...)".
3. Given pending iken çıkarılmış ürün, Then kayıt yok ve blok görünmez.

### SİP-010 — OrderContext SSE işleyicisi (tüm olay tipleri)
**Ne yapar:** Admin stream'ini fetch + ReadableStream ile okur. Olay tipine göre state'i günceller ya da window olayı yayınlar. Bağlantı koparsa 3 sn sonra yeniden bağlanır. Ayrıca 60 sn'de bir tam senkron yapar.

**Nerede:** `OrderContext.tsx:304-508`

| Olay | Davranış |
|---|---|
| `staff_update` | → `atlasqr:staff-update` window olayı |
| `change_request` | → `atlasqr:change-request` window olayı |
| `kitchen_notice_ack` | → ack + refetch |
| `tables_changed` | → `atlasqr:tables-changed` (siparişleri **yeniden çekmez**) |
| `new_order` / `call` | → ses; `data.order` varsa başa eklenir (aynı id varsa eklenmez), yoksa tam çekme |
| `call_taken` | → kaldırma |
| `order_cancelled` | → kaldırma + ack |
| `order_status` (`order_type==='order'`) | → delivered ise kaldırma, değilse durum güncelleme (ack çağrılmaz) |
| `kitchen_order_ready` | → ready |
| `order_items_added` / `order_items_updated` | → ses + `addUpdate` + refetch |

**Kurallar:**
- `response.ok` kontrol edilmiyor.
- Yeniden bağlanınca kaçırılan olaylar telafi edilmiyor; ancak 60 sn senkron telafi eder.
- Masa kapatılarak (`cancel_pending`) iptal edilen siparişler admin'de 60 sn'ye kadar görünür kalır.

**Mevcut test:** yok

**Test önerisi (K1, mock ReadableStream + fake timers):**
1. Given aynı `new_order` iki kez gelir, Then liste tek kayıt içerir.
2. Given chunk iki parçaya bölünmüş `data:` satırı, Then buffer birleştirir ve tek olay işlenir.
3. Given stream kapanır, Then 3 sn sonra yeniden `fetch`. Given unmount, Then abort edilir ve yeniden bağlanılmaz.
4. Given `order_status` `{order_type:'call'}`, Then hiçbir değişiklik olmaz.
5. Given masa `cancel_pending` ile kapatıldı (yalnızca `tables_changed` geldi), Then 60 sn içinde kart düşer. Bu, mevcut gecikmeyi belgeleyen bir regresyon testi olmalı.

### SİP-011 — Ses ve `unlockAudio`
**Ne yapar:** Yeni sipariş, çağrı ve güncelleme için ayrı tonlar çalar. Layout'a ilk tıklamada `unlockAudio` çalışır.

**Nerede:**
- `OrderContext.tsx:98-150`, `:201-208`
- `Layout.tsx:202` (`onClick={unlockAudio}`)

**Kurallar:**
- Her ses yeni bir `AudioContext` oluşturuyor ve hiçbiri kapatılmıyor.
- `unlockAudio` ayrı bir bağlamı açıyor; sonraki seslere etkisi yok.

**Mevcut test:** yok

**Test önerisi (K1, AudioContext mock):**
1. Given `call` olayı, Then 1318 Hz frekansında 3 osilatör.
2. Given `new_order` olayı, Then 987 Hz ve 783 Hz tonları.
3. Given 50 olay, Then 50 `AudioContext` oluşur ve hiçbiri `close()` edilmez (sızıntıyı belgeleyen test).

### SİP-012 — Aktif/Geçmiş geçişi, Yenile düğmesi, filtre kalıcılığı, sayaçlar
**Ne yapar:**
- Seçilen görünüm `localStorage`'da `atlasqr:orders:filter` anahtarıyla saklanır. Eski `'delivered'` değeri "Geçmiş"e çevrilir.
- Yenile düğmesi:
  - Aktif görünümde `refreshActive` + `reloadRequests` çağırır
  - Geçmiş görünümünde `historyRefreshKey++` yapar
- Başlıkta "N yeni" ve "N güncelleme" rozetleri, menüde `pendingCount` rozeti görünür.

**Nerede:**
- `OrdersPage.tsx:19`, `:549-553`, `:576-578`, `:596-609`, `:611`, `:637-661`
- `Layout.tsx:90`
- `OrderContext.tsx:510-511`

**Kurallar:**
- `pendingCount` pending durumdaki **çağrıları da** sayar.
- "N güncelleme" sayacı `pendingUpdates.size` kullanır, yani ekranda görünmeyen bayat kayıtları da sayar.

**Mevcut test:** yok

**Test önerisi (K1 + K3):**
1. Given Geçmiş seçildi, When sayfa yenilenir, Then Geçmiş açılır.
2. Given `localStorage='delivered'`, Then Geçmiş açılır.
3. Given Aktif görünüm, When Yenile, Then `GET /admin/orders` + `GET /admin/change-requests` çağrılır ve "Liste güncellendi." toast'ı çıkar. Düğme 300 ms boyunca pasif kalır.
4. Given 2 pending sipariş + 1 pending çağrı, Then "3 yeni" (mevcut davranış; karar testi).

### SİP-013 — Geçmiş: tarih ön ayarları ve özel aralık
**Ne yapar:** Ön ayarlar: Bugün, Dün, Son 7 gün, Bu ay, Özel. Özel aralıkta başlangıç bitişten sonra olamaz ve gelecek tarih seçilemez. Aralık `[from, to)` şeklinde, tarayıcının yerel saatine göre hesaplanır.

**Nerede:**
- UI: `OrderHistory.tsx:55-61`, `:88-110`, `:121-123`, `:142-146`, `:226-241`, `:267`
- API doğrulaması: `orderRoutes.ts:92-102` (ISO + offset zorunlu, `from < to`, en fazla 400 gün)

**Kurallar:**
- Bugün dışındaki ön ayarlarda satırlarda tarih de gösterilir (`:343`).
- Geçersiz aralıkta istek gönderilmez.

**Mevcut test:** yok

**Test önerisi (K1 `rangeFor` + K2):**
1. Given "Dün", Then from = dün 00:00 yerel, to = bugün 00:00.
2. Given "Son 7 gün", Then from = bugün−6 00:00, to = yarın 00:00.
3. Given Özel aralıkta from > to, Then "Başlangıç tarihi bitişten sonra olamaz." ve istek gönderilmez.
4. Given API'ye 401 günlük aralık, Then 400 ve "En fazla ~13 aylık aralık seçilebilir."
5. Given `from == to`, Then 400 "Tarih aralığı geçersiz."

### SİP-014 — Geçmiş: filtreler (durum, masa, personel, arama)
**Ne yapar:**
- Durum: Tümü / Teslim / İptal / İade
- Masa ve personel seçimi; personelde "Müşteri (QR)" = `waiter_id IS NULL`
- Ürün ya da masa araması: 300 ms debounce, en fazla 60 karakter, LIKE joker karakterleri escape edilir
- "Filtreleri temizle" bağlantısı

**Nerede:**
- UI: `OrderHistory.tsx:124-140`, `:148-158`, `:243-271`
- API: `orderHistoryService.ts:85-129` (İade = cancelled AND (`preparing_at` dolu OR onaylı `order_cancel` talebi var)), `:183-189` (seçenekler; pasif masa ve personel dahil)

**Kurallar:**
- Yalnızca `type='order'` ve status ∈ {delivered, cancelled}.
- Filtre değişince sayfa 1'e dönülür.
- Sipariş numarası filtreden önce hesaplanır (CTE `base`).

**Mevcut test:** yok

**Test önerisi (K2):**
1. Given preparing iken iptal edilmiş sipariş A ve pending iken iptal edilmiş sipariş B, Then `status=refunded` → yalnızca A, `status=cancelled` → yalnızca B.
2. Given `q='%'`, Then joker gibi davranmaz; yalnızca '%' içeren kayıtlar döner.
3. Given `waiter_id=customer`, Then yalnızca QR siparişleri.
4. Given masa filtresi uygulanmış, Then sipariş numaraları filtresiz numaralarla aynı kalır (ör. #7).

### SİP-015 — Geçmiş: özet kartları
**Ne yapar:** Sipariş sayısı (teslim edilen sayısıyla), teslim cirosu (ortalama tutarla), İptal/İade sayısı ve kayıp tutarı, ortalama teslim süresi (dk) gösterilir.

**Nerede:**
- `orderHistoryService.ts:136-148`
- `OrderHistory.tsx:286-302`

**Kurallar:**
- `lost_int` = iptal edilen siparişlerin **kalan** `order_items` toplamı. Kısmi iptalde silinen kalemler bu toplama girmez.
- Ortalama teslim süresi yalnızca `delivered_at` dolu kayıtlardan hesaplanır.

**Mevcut test:** yok

**Test önerisi (K2):**
1. Given 2 teslim (100 + 200) ve 1 iptal (50), Then count=3, delivered_count=2, revenue=300, lost=50.
2. Given 10 dk ve 20 dk süren teslimler, Then ortalama 15 dk.
3. Given teslim yok, Then `avg_delivery_min=null` ve UI'da "—".

### SİP-016 — Geçmiş: sayfalama
**Ne yapar:** Sayfa başına 25 kayıt; önceki/sonraki düğmeleri ve "a–b / toplam" göstergesi.

**Nerede:**
- `OrderHistory.tsx:17`, `:160-173`, `:217`, `:365-378`
- API: `page_size` 10–100 arası (`orderRoutes.ts:99-100`), `LIMIT/OFFSET` (`orderHistoryService.ts:174`)

**Kurallar:**
- Sayfalama yalnızca toplam > 25 ise gösterilir.
- Eski istekler `cancelled` bayrağıyla yok sayılır.

**Mevcut test:** yok

**Test önerisi (K2 + K1):**
1. Given 60 kayıt, When page=3, Then 10 satır ve "51–60 / 60".
2. Given 3. sayfadayken filtre değişir, Then istek page=1 ile gider ve ekranda eski sonuç görünmez.
3. Given `page_size=5`, Then 400.

### SİP-017 — Geçmiş: detay modalı (zaman çizelgesi ve iptaller)
**Ne yapar:** Satıra tıklanınca ya da Enter'a basılınca açılır. İçerik:
- zaman çizelgesi: Verildi → Hazırlanıyor → Hazır → Teslim / İptal / İade
- teslim süresi
- ürünler ve notları, genel not, toplam
- iptal bilgisi: sebep, iade talep eden, onaylayan / iptal eden (yoksa `whole_order` kaydındaki kişi)
- önceden iptal edilen ürünler

Esc tuşu ya da arka plana tıklama modalı kapatır.

**Nerede:** `OrderHistory.tsx:334-339`, `:381`, `:386-465`

**Kurallar:** Tutar iptal edilmiş siparişte üstü çizili gösterilir.

**Mevcut test:** yok

**Test önerisi (K1 + K3):**
1. Given teslim edilmiş sipariş (preparing ve ready zamanları dolu), Then 4 adım da saatli ve "Teslim süresi: N dk".
2. Given onaylı `order_cancel` iadesi, Then "İade talep eden: Ayşe" ve "Onaylayan: admin@...".
3. Given garsonun doğrudan iptal ettiği sipariş (`cancelled_by` null), Then "İptal eden: <actor_name>".
4. Given modal açık, When Esc, Then kapanır.

### SİP-018 — Geçmiş: Excel dışa aktarma (sipariş bazlı / ürün bazlı)
**Ne yapar:** Aynı filtrelerle .xlsx dosyası üretir. Sipariş sayfası 13 sütun, ürün sayfası 11 sütundur; ikisinin yanında "Özet" sayfası vardır. Dosya adı `siparisler_[urunler_]YYYY-MM-DD_YYYY-MM-DD.xlsx`.

**Nerede:**
- UI: `OrderHistory.tsx:185-214`, `:273-282`
- API: `GET /api/admin/orders/history/export` → `orderRoutes.ts:130-148`
- `orderHistoryService.ts:195-323` (`EXPORT_LIMIT=10000`, para formatı, dondurulmuş başlık satırı, autoFilter)
- CORS `exposedHeaders: ['Content-Disposition']` (`app.ts:46`)

**Kurallar:**
- Kayıt yoksa düğmeler pasif.
- `label` en fazla 200 karakter.
- Limit aşılırsa Özet sayfasında "Uyarı" satırı çıkar; ancak `truncated` bilgisi HTTP yanıtına yansımaz.
- Hata mesajı ortak hata kutusunda gösterilir.

**Mevcut test:** yok

**Test önerisi (K2 exceljs ile geri okuma + K3 indirme):**
1. Given 3 sipariş, When `mode=orders`, Then 200, doğru content-type, dosya adı tarih aralığına göre, "Siparişler" sayfasında 3 veri satırı ve "Özet" sayfasında ciro doğru.
2. Given `mode=items`, Then ürün başına bir satır ve Tutar = adet × birim.
3. Given kısmi iptal, Then "İptal Edilen Ürünler" sütunu yalnızca `whole_order=false` kayıtları içerir.
4. Given geçersiz aralık, Then 400 JSON. UI'da hata kutusu çıkar.
5. Given Playwright indirme, Then dosya adı sunucunun verdiği adla aynı.

### SİP-019 — Teslim edilmiş siparişin iptalinde oturum toplamının düşürülmesi
**Ne yapar:** Teslim edilmiş ve oturuma bağlı sipariş iptal edilince adisyon toplamından düşülür.

**Nerede:** `orderRoutes.ts:355`, `:375-386`, `sessionService.decrementSessionTotal`

**Kurallar:**
- Toplam 0 ise düşüm yapılmaz.
- Kalemler `order_status='delivered'` ile iptal kaydına yazılır ("teslimden sonra").
- Mutfak notice'i yazılmaz.
- Mevcut UI'da teslim edilmiş siparişi iptal eden bir giriş noktası yok; yol yalnızca API üzerinden.

**Mevcut test:** yok

**Test önerisi (K2):**
1. Given oturum toplamı 500 ve teslim edilmiş sipariş 200, When cancel, Then toplam 300 ve cancellations'da `order_status='delivered'`.
2. Given oturumsuz teslim edilmiş sipariş, Then hata yok ve düşüm yok.
3. Given aynı sipariş ikinci kez cancel edilir, Then 409 ve toplam değişmez.

---

# RİSKLİ ALANLAR VE OLASI REGRESYONLAR

1. **Hazır olan siparişte kalan notice, iptal edilince mutfakta "hayalet kart" çıkarır.**
   - `markKitchenOrderReady` (`kitchenService.ts:185-191`) `kitchen_notice`'i temizlemiyor.
   - Liste koşulu `status='cancelled' AND kitchen_notice IS NOT NULL` (`kitchenService.ts:119-120`).
   - Sonuç: Gördüm denmemiş notice ile "Hazır"a geçen sipariş sonradan (ready ya da delivered iken) iptal edilirse mutfakta yeniden "İptal edildi" kartı belirir.

2. **Admin'deki "GÜNCELLEME" paneli bayat kalabiliyor.**
   - Ready siparişlerde budama olmuyor (`OrderContext.tsx:222` yalnızca pending/preparing'e bakıyor).
   - İlk yükleme ve 60 sn senkron `applyOrders` kullanmıyor (`OrderContext.tsx:309`, `:494`, `:398`).
   - `updateCount = pendingUpdates.size` (`OrdersPage.tsx:617`) ekranda görünmeyen kayıtları da sayıyor.
   - `pendingUpdates` yalnızca bellekte; sayfa yenilenince sunucudaki `kitchen_notice` olsa bile panel kaybolur.

3. **Senkron tek yönlü.** Admin "Gördüm" (`OrdersPage.tsx:698` → `acknowledgeUpdate`) mutfağa iletilmiyor; mutfak kartı yanıp sönmeye devam ediyor.

4. **Mutfak SSE filtresi çağrıları süzmüyor.** `kitchenRoutes.ts:229-230` yalnızca `new_order` için `order_type` kontrol ediyor. Sonuçlar:
   - çağrı iptali (`order_cancelled`, `order_type:'call'`) mutfakta değişiklik sesi çaldırıyor
   - `change_request` `decided` olayları da ses çaldırıyor (`KitchenScreenPage.tsx:59`)

5. **Mutfak stream'i HTTP hatasıyla kalıcı ölüyor.** Stream HTTP hatası alınca EventSource CLOSED olur, kod yalnızca `load()` çağırır, stream yeniden kurulmaz ve rozet "Canlı" gösterir (`KitchenScreenPage.tsx:192-197`, `:150-151`). Sistem 30 sn yoklamaya kalır.

6. **Admin SSE'de yanıt durumu kontrol edilmiyor ve kaçan olaylar telafi edilmiyor.**
   - `response.ok` kontrolü yok; 401'de her 3 sn'de sonsuz yeniden bağlanma döngüsü oluşuyor (`OrderContext.tsx:332-337`, `:482-485`).
   - Yeniden bağlanmada kaçırılan olaylar telafi edilmiyor; yalnızca 60 sn senkron telafi ediyor.

7. **Bazı iptal yolları tutarsız.** `sessionRoutes.ts:229-239` (`cancel_pending`) ve `paymentService.ts:258-269`:
   - `recordWholeOrderCancellation` çağrılmıyor → mutfak notice'i yok, kayıt yok.
   - `cancel_pending` `order_cancelled` yayınlamıyor (yalnızca middleware'den `tables_changed`) → admin kartı 60 sn'ye kadar kalıyor.

8. **`PUT /admin/orders/:id` gevşek kurallı.**
   - id UUID olarak doğrulanmıyor → muhtemelen 500 (aynısı cancel ve DELETE için).
   - Geri yönlü geçişlere ve çağrıyı "preparing" yapmaya izin var.
   - Admin "Hazır" dediğinde `kitchen_order_ready` yayınlanmıyor → garson hazır bildirimi almıyor (`orderRoutes.ts:201-308`).
   - `DELETE /:id` (legacy, `orderRoutes.ts:415-432`): session toplamını artırmadan delivered yapıyor ve yayın yapmıyor. Web'de kullanılmıyor ama açık bir uç nokta.

9. **Aktif listede `LIMIT 100` var** (`orderRoutes.ts:192`). Yoğun işletmede en eski aktif siparişler ve çağrılar kayboluyor. Mutfakta limit 200, `order_no` ise yalnızca son 2 güne göre hesaplanıyor (`kitchenService.ts:104`).

10. **Kitchen token için owner'a yazma izni var.** `kitchenRoutes.ts:33` owner'ın token sıfırlamasına izin veriyor; bu, owner'ın salt-okur olduğu ilkeyle çelişiyor (`auth.ts:104-107`). Ayrıca token URL'de taşınıyor ve `requestLogger` `originalUrl`'i logluyor, yani token loglara sızıyor.

11. **Ack her zaman 200 dönüyor ve yayın yapıyor.** `kitchenRoutes.ts:133-136` ack sonucunu kontrol etmiyor; her ack `kitchen_notice_ack` yayınlıyor ve tüm admin ekranlarında tam yeniden çekmeyi tetikliyor.

12. **Talep onay yolunda tutarsızlıklar var.**
    - `item_decrease` talebi oluşturulurken mutfak notice'i yazılmıyor, ama reddedilince 'info' notice yazılıyor (`changeRequestService.ts:328-331`).
    - `item_decrease` onayında `is_paid` ve `updated_at` kontrol edilmiyor (`:313-322`).
    - Kendi onayı sonrası admin'e `order_items_updated` → kendi kartında "GÜNCELLEME" paneli açılıyor.

13. **Geçmişte saat dilimi ve tutar hesapları zayıf.**
    - Aralık tarayıcının yerel saatiyle hesaplanıyor, sipariş numarası İstanbul gününe göre (`OrderHistory.tsx:88-110` vs `orderHistoryService.ts:106`, `:117`). Farklı saat dilimindeki bir tarayıcıda gün sınırları kayar.
    - `lost_int` kısmi iptalleri içermiyor (`:143`).
    - Export'taki `truncated` bilgisi istemciye ulaşmıyor.

14. **Admin ses bağlamları sızıyor.** Her ses yeni bir `AudioContext` açıyor ve kapatmıyor; `unlockAudio` işlevsiz (`OrderContext.tsx:98-150`, `:201-208`). Uzun açık kalan sekmelerde bağlam limiti ve sızıntı riski var.

15. **`pendingCount` çağrıları da sayıyor** (`OrderContext.tsx:510`, `OrdersPage.tsx:611`). "N yeni" rozeti ve menü rozeti yemek siparişi sayısıyla uyuşmuyor; sayaçlarda regresyon riski.

16. **Web tarafında test altyapısı yok** (`apps/web/package.json`). K1-UI ve K3 senaryoları için önce vitest + RTL ve Playwright kurulmalı. API testleri de mutfak, sipariş ve talep rotalarına hiç dokunmuyor.

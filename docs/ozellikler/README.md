# AtlasQR — Özellik kataloğu ve test haritası

Bu klasör sistemin çalışan bütün özelliklerinin kaydıdır. Her özelliğin bir numarası var (ör. `KAS-012`). Numaralar:
- testlerin adlarında ve süper admin "Sistem testleri" panelinde,
- hata kayıtlarında ve geri bildirimlerde ("GRS-003 bozuldu"),
- tanıtım sitesindeki özellik listesinin kaynağı olarak

kullanılır. Bir özellik değişince ya da yenisi eklenince bu dosyalar da güncellenir.

İlk tarama: 2026-10-03, kodun tamamı (web, API, migration'lar) okunarak çıkarıldı.

## Bölümler

| Dosya | Kapsam | Özellik sayısı |
|---|---|---|
| [01-musteri.md](01-musteri.md) | QR menü, sepet, sipariş, garson çağırma, Siparişlerim; tanıtım sayfaları | MUS 40 · TAN 3 |
| [02-garson.md](02-garson.md) | Garson girişi ve oturumu, masalar, masa detayı, iptal/iade, menüden sipariş, çağrılar, mola, yetkiler | GRS 31 |
| [03-mutfak-siparisler.md](03-mutfak-siparisler.md) | Mutfak ekranı, zil, "Gördüm"; admin Siparişler (aktif + Geçmiş + Excel), onay talepleri | MUT 17 · SİP 19 |
| [04-kasa-masalar.md](04-kasa-masalar.md) | Kasa (tahsilat, bölme, indirim, ikram, iptal, kapatma), Masalar (taşıma, birleştirme), QR | KAS 21 · MAS 10 · QR 2 |
| [05-yonetim-giris-superadmin-platform.md](05-yonetim-giris-superadmin-platform.md) | Panel, kategoriler, ürünler, ayarlar, personel; giriş; işletme sahibi; süper admin; hata kayıtları; altyapı | PNL 17 · KAT 6 · URN 7 · AYR 13 · PRS 13 · GIR 12 · SAH 7 · SUP 10 · HAT 11 · PLT 14 |
| **Toplam** | | **253** |

## Test katmanları

| Katman | Ne | Nerede çalışır | Süre |
|---|---|---|---|
| **K1** | Birim / hesaplama: para, indirim dağıtımı, bölme, yetki kuralları, tutar girişi, sıralama | Her gönderimde (CI) | saniyeler |
| **K2** | API akış testleri, gerçek Postgres + Redis: sipariş → mutfak → teslim → kasa → kapatma, iptal/onay, yetki matrisi, canlı olaylar, işletmeler arası veri ayrımı | Her gönderimde (CI) | 1–2 dk |
| **K3** | Tarayıcı (Playwright): ekranlarda gerçek tıklama, çoklu sekme/cihaz (iki garson + F5, mutfak "Gördüm" → admin), telefon görünümü | Canlıya geçmeden önce + her gece deneme sitesinde | 5–10 dk |

Kural: Fark edilen her hata önce onu yakalayan bir testle kayda geçer, sonra düzeltilir.

## Mevcut durum

- Toplam 6 test var (giriş akışı, menü önbelleği, işletmeler arası ürün ayrımı); hepsi sahte (mock) veritabanıyla.
- Garson, mutfak, kasa, sipariş, onay talepleri, süper admin ve canlı olaylar için **hiç test yok**.
- Web tarafında test altyapısı yok (vitest/Playwright kurulu değil).
- CI (GitHub Actions) kurulu: tip kontrolü, boş veritabanında bütün migration'lar, mevcut testler, web derlemesi.

## Tarama sırasında bulunan en önemli sorunlar

Ayrıntıları ilgili bölümün sonundaki "Riskli alanlar" listesinde. Önem sırasına göre:

**Güvenlik / yetki**
1. Süper admin, Personel ve İşletme sahibi sayfalarının bazı istekleri oturum yenilemiyor; ~15 dk sonra sayfalar hata vermeye başlayabilir (05 · risk 10).
2. Süper admin API'si yalnızca oturum anahtarını kontrol ediyor; şifre değişikliği ve hesap pasifliği kontrol edilmiyor (05 · risk 9).
3. Garson isteklerinde sekme bilgisi gönderilmezse sekme bağlama atlatılıyor; garson çıkışı kimlik doğrulamasız (02 · GRS-005, GRS-006).
4. Personel QR kodu üretilirken giriş anahtarı üçüncü taraf bir siteye (`api.qrserver.com`) gönderiliyor (05 · risk 11).
5. Masa linkini bilen herkes o masanın adisyonunu okuyabiliyor; "müşteri hesabı görebilir" ayarı uygulanmıyor (01 · MUS-036).

**Para**
6. Kasa tutar girişinde "1.250" yazınca 1,25 TL olarak okunuyor (04 · R-01).
7. Kalan tutar bazı yollarla negatife düşebiliyor ve hesap sessizce kapanıyor (fazla ödeme) (04 · R-02).
8. Sipariş transferi ödemeleri/ikramları taşımıyor; müşteri iki kez ödeyebilir (04 · R-04).
9. Bekleyenleri yeni hesaba taşırken masa tutarı iki kez sayılıyor (04 · R-03).

**İşleyiş**
10. "Sipariş alımı kapalı" ayarı uygulanmıyor (01, 05).
11. Menü, adisyon ve hata kaydı aynı "IP başına 60 istek" sınırını paylaşıyor; kalabalık bir kafede müşteriler menüyü açamayabilir ve ekranda "Menü bulunamadı" görür (01 · risk 3, 05 · risk 16).
12. Birleştirilmiş masalarda bazı kapatma yollarından sonra masa Kasa'da hiç görünmüyor (04 · R-07).
13. Ürün görseli ve açıklaması kaldırılamıyor; ürün listesi 100 ürünle sınırlı (05 · risk 1-3).
14. Hazır durumdaki siparişte adet artırılabiliyor ve mutfağa bildirim gitmiyor (02 · GRS-015).

## Önerilen test kurulum sırası

1. **Altyapı:** gerçek Postgres + Redis ile K2 test düzeni (demo işletme, masalar, ürünler, garsonlar); web için vitest; Playwright.
2. **Kasa ve para (K1 + K2):** `computeLedger`, tahsilat, iptal, indirim, ikram, kapatma; kilit ve kırpma senaryoları; yukarıdaki para sorunlarını belgeleyen (başta kırmızı) testler.
3. **Sipariş → mutfak → teslim → iptal/onay (K2):** canlı olaylar dahil.
4. **Garson yetki matrisi ve oturum (K2 + K3):** iki garson iki sekme F5.
5. **Admin ekranları ve müşteri menüsü (K3).**
6. **Süper admin "Sistem testleri" paneli:** canlı ortamda güvenli kısa kontroller (veritabanı, Redis, canlı olay, giriş akışı) + CI sonuçlarının listesi; başarısız testler hata kayıtlarına düşer. Tasarım önerisi 05 numaralı bölümün sonunda.

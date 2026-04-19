// apps/web/src/pages/owner/OwnerDashboardPage.tsx
// Şu an boş iskelet — gerçek içerik sonraki seansta eklenecek

export function OwnerDashboardPage() {
  return (
    <div>
      {/* KPI Kartları - placeholder */}
      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {['Günlük Ciro', 'Sipariş Sayısı', 'Ortalama Adisyon', 'İptal Oranı'].map(label => (
          <div key={label} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E2E8F0' }}>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#64748B' }}>
              {label}
            </div>
            <div className="text-2xl font-bold" style={{ color: '#CBD5E1', fontFamily: 'Georgia, serif' }}>
              --
            </div>
            <div className="text-xs mt-1" style={{ color: '#CBD5E1' }}>
              yakında
            </div>
          </div>
        ))}
      </div>

      {/* İnşaat bildirimi */}
      <div
        className="rounded-2xl p-8 text-center"
        style={{ background: 'white', border: '1px dashed #CBD5E1' }}
      >
        <div className="text-5xl mb-4">🚧</div>
        <h2
          className="font-bold text-xl mb-2"
          style={{ color: '#0F172A', fontFamily: 'Georgia, serif' }}
        >
          Raporlar Yakında
        </h2>
        <p className="text-sm max-w-md mx-auto" style={{ color: '#64748B' }}>
          Bu alan işletmenize ait günlük/aylık ciro, en çok satan ürünler, iptal analizi ve masa
          performansı gibi raporları içerecek.
        </p>
        <div className="mt-6 grid gap-2 max-w-sm mx-auto text-left">
          {[
            '📊 Günlük/aylık satış raporları',
            '📦 En çok satan ürünler',
            '❌ İptal & kasa açığı raporu',
            '🪑 Masa performansı',
            '⏰ Saatlik yoğunluk analizi'
          ].map(item => (
            <div
              key={item}
              className="text-xs px-3 py-2 rounded-lg"
              style={{ background: '#F8FAFC', color: '#64748B' }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
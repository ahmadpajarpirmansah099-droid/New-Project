(function () {
  const page = document.getElementById('page-user-guide');
  const root = document.getElementById('userGuideRoot');
  if (!page || !root || window.UserGuideInitialized) return;

  const dashboardVisual =
    '<svg class="ug-hero-screen" viewBox="0 0 420 780" role="img" aria-label="Ilustrasi Dashboard Guest dengan data contoh fiktif" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
      '<linearGradient id="ug-screen-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbfcf6"/><stop offset="1" stop-color="#f0f2e8"/></linearGradient>' +
      '<linearGradient id="ug-screen-lime" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e5f5a7"/><stop offset="1" stop-color="#c9e878"/></linearGradient>' +
      '<filter id="ug-screen-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#20212d" flood-opacity=".09"/></filter>' +
    '</defs>' +
    '<rect width="420" height="780" fill="url(#ug-screen-bg)"/><circle cx="390" cy="250" r="150" fill="#e6efcf" opacity=".24"/>' +
    '<g font-family="Arial,sans-serif">' +
      '<rect x="20" y="18" width="40" height="40" rx="20" fill="#17182b"/><path d="M31 43v-2a9 9 0 0 1 18 0v2M35 31a5 5 0 1 0 10 0 5 5 0 0 0-10 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' +
      '<text x="72" y="34" fill="#17182b" font-size="12" font-weight="800">GUEST OPERATIONAL</text><text x="72" y="49" fill="#858694" font-size="8">LAZY JENNIE · SERVICE</text>' +
      '<circle cx="337" cy="38" r="19" fill="#e9e6f7"/><text x="337" y="42" text-anchor="middle" fill="#17182b" font-size="11" font-weight="700">AP</text>' +
      '<rect x="371" y="18" width="29" height="40" rx="12" fill="#17182b"/><path d="M380 30h11M380 38h11M380 46h11" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' +
      '<text x="22" y="82" fill="#858694" font-size="8" font-weight="700" letter-spacing="1.2">OUTLET</text><text x="218" y="82" fill="#858694" font-size="8" font-weight="700" letter-spacing="1.2">DIVISI</text>' +
      '<rect x="20" y="90" width="182" height="46" rx="11" fill="#fff" stroke="#e8e9e0"/><text x="34" y="118" fill="#303044" font-size="13" font-weight="700">Lazy Jennie</text><path d="m180 108 6 6 6-6" fill="none" stroke="#858694" stroke-width="1.8" stroke-linecap="round"/>' +
      '<rect x="214" y="90" width="186" height="46" rx="11" fill="#fff" stroke="#e8e9e0"/><text x="228" y="118" fill="#303044" font-size="13" font-weight="700">Service</text><path d="m378 108 6 6 6-6" fill="none" stroke="#858694" stroke-width="1.8" stroke-linecap="round"/>' +
      '<text x="22" y="180" fill="#858694" font-size="9" font-weight="800" letter-spacing="1.5">ADMIN</text><text x="22" y="216" fill="#17182b" font-size="27" font-weight="800">Selamat datang.</text>' +
      '<rect x="22" y="238" width="376" height="132" rx="19" fill="url(#ug-screen-lime)" filter="url(#ug-screen-shadow)"/><circle cx="380" cy="263" r="90" fill="none" stroke="#17182b" stroke-opacity=".08"/><circle cx="380" cy="263" r="116" fill="none" stroke="#17182b" stroke-opacity=".045"/>' +
      '<text x="42" y="269" fill="#596346" font-size="10">Total tamu pada tanggal dipilih</text><text x="42" y="326" fill="#17182b" font-size="45" font-weight="800">4</text><text x="42" y="350" fill="#596346" font-size="11" font-weight="600">10 total pack</text><text x="160" y="350" fill="#596346" font-size="11">— rata-rata tunggu</text>' +
      '<g filter="url(#ug-screen-shadow)"><rect x="22" y="386" width="117" height="105" rx="15" fill="#fff"/><rect x="151" y="386" width="117" height="105" rx="15" fill="#fff"/><rect x="280" y="386" width="118" height="105" rx="15" fill="#fff"/></g>' +
      '<text x="36" y="413" fill="#858694" font-size="8" font-weight="800">MENUNGGU</text><circle cx="116" cy="406" r="11" fill="#f4efd9"/><text x="36" y="459" fill="#17182b" font-size="27" font-weight="800">4</text><text x="36" y="476" fill="#858694" font-size="8">Antrean aktif</text>' +
      '<text x="165" y="413" fill="#858694" font-size="8" font-weight="800">SELESAI</text><circle cx="245" cy="406" r="11" fill="#e3f2e9"/><text x="165" y="459" fill="#17182b" font-size="27" font-weight="800">0</text><text x="165" y="476" fill="#858694" font-size="8">Kunjungan selesai</text>' +
      '<text x="294" y="413" fill="#858694" font-size="8" font-weight="800">BATAL</text><circle cx="375" cy="406" r="11" fill="#f7e9e9"/><text x="294" y="459" fill="#17182b" font-size="27" font-weight="800">0</text><text x="294" y="476" fill="#858694" font-size="8">Dibatalkan</text>' +
      '<text x="24" y="534" fill="#17182b" font-size="15" font-weight="800">Antrean aktif</text><text x="395" y="534" text-anchor="end" fill="#777985" font-size="9" font-weight="700">Lihat semua →</text>' +
      '<g filter="url(#ug-screen-shadow)"><rect x="22" y="551" width="376" height="86" rx="15" fill="#fff"/><rect x="22" y="649" width="376" height="86" rx="15" fill="#fff"/></g>' +
      '<rect x="34" y="562" width="54" height="64" rx="10" fill="#eff6ce"/><text x="61" y="598" text-anchor="middle" fill="#52602e" font-size="9" font-weight="800">WL-001</text><text x="101" y="580" fill="#17182b" font-size="12" font-weight="800">Tamu Demo 01</text><text x="101" y="598" fill="#858694" font-size="9">2 pack · 13.21</text><text x="101" y="617" fill="#858694" font-size="9">Waiting time 20 menit</text><rect x="322" y="570" width="63" height="24" rx="9" fill="#f5f0d9"/><text x="353" y="586" text-anchor="middle" fill="#84723b" font-size="8" font-weight="800">Menunggu</text>' +
      '<rect x="34" y="660" width="54" height="64" rx="10" fill="#eff6ce"/><text x="61" y="696" text-anchor="middle" fill="#52602e" font-size="9" font-weight="800">WL-002</text><text x="101" y="678" fill="#17182b" font-size="12" font-weight="800">Tamu Demo 02</text><text x="101" y="696" fill="#858694" font-size="9">2 pack · 13.25</text><text x="101" y="715" fill="#858694" font-size="9">Waiting time 16 menit</text><rect x="322" y="668" width="63" height="24" rx="9" fill="#f5f0d9"/><text x="353" y="684" text-anchor="middle" fill="#84723b" font-size="8" font-weight="800">Menunggu</text>' +
    '</g></svg>';

  root.innerHTML =
    '<section class="ug-hero" aria-labelledby="ug-title">' +
      '<div class="ug-hero-copy">' +
        '<span class="ug-eyebrow">PANDUAN PENGGUNA · NEW PROJECT</span>' +
        '<h1 id="ug-title">Kenali cara kerja <em>Guest Operational.</em></h1>' +
        '<p>Panduan pengguna untuk membantu tim memahami alur kedatangan tamu, antrean, dan operasional. Materi akan ditambahkan bertahap.</p>' +
        '<div class="ug-hero-meta"><span><b>Panduan bertahap</b></span><i></i><span>Mobile & desktop</span></div>' +
        '<div class="ug-hero-cta"><button class="ug-btn ug-btn-dark" type="button" data-ug-start>Jelajahi panduan <span aria-hidden="true">↓</span></button><button class="ug-btn ug-btn-light" type="button" data-ug-dashboard>Kembali ke Dashboard</button></div>' +
      '</div>' +
      '<div class="ug-hero-art" aria-label="Ilustrasi Dashboard Guest"><div class="ug-hero-orbit" aria-hidden="true"></div><div class="ug-hero-device">' + dashboardVisual + '</div><span class="ug-hero-device-label">Dashboard Guest · Ilustrasi UI</span></div>' +
    '</section>';

  root.addEventListener('click', event => {
    const start = event.target.closest('[data-ug-start]');
    if (start) {
      if (typeof window.toast === 'function') window.toast('Panduan akan ditambahkan bertahap.');
      return;
    }
    const dashboard = event.target.closest('[data-ug-dashboard]');
    if (dashboard && typeof window.go === 'function') window.go('dashboard');
  });

  window.UserGuideInitialized = true;
})();
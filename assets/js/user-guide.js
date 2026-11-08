
(function () {
  const page = document.getElementById('page-user-guide');
  const root = document.getElementById('userGuideRoot');
  if (!page || !root || page.dataset.initialized === 'true') return;
  page.dataset.initialized = 'true';

  const features = [
    {id:'dashboard',no:'01',title:'Dashboard',group:'RINGKASAN OPERASIONAL',desc:'Ringkasan aktivitas tamu pada tanggal yang sedang dipilih.',image:true,steps:[
      ['Periksa konteks workspace','Header menampilkan identitas workspace dan akun. Pemilihan outlet atau divisi hanya muncul pada konteks yang memiliki akses.'],
      ['Baca ringkasan kunjungan','Kartu utama menunjukkan total tamu, total pack, dan rata-rata waktu tunggu untuk tanggal yang dipilih.'],
      ['Pantau status operasional','Kartu Menunggu, Selesai, dan Batal membantu melihat kondisi kunjungan.'],
      ['Buka daftar atau detail','Gunakan Lihat semua atau tombol Detail pada kartu antrean aktif.']
    ],note:'Angka pada dashboard mengikuti tanggal operasional yang sedang dipilih.'},
    {id:'add-guest',no:'02',title:'Tambah Tamu',group:'REGISTRASI TAMU',desc:'Catat kedatangan baru melalui menu cepat yang dibuka dari tombol tambah.',steps:[
      ['Tekan tombol +','Buka menu cepat Guest Operational, lalu pilih Tambah Tamu.'],
      ['Isi nama tamu','Nama tamu wajib diisi. Batas nama pada form adalah 70 karakter.'],
      ['Atur jumlah pack','Gunakan tombol minus dan plus. Nilai yang diizinkan mulai dari 1 hingga 30 pack.'],
      ['Lengkapi data opsional','Nomor WhatsApp dapat dikosongkan. Pilih status awal Menunggu atau Langsung duduk.'],
      ['Simpan tamu','Setelah data berhasil disimpan, sistem membuat nomor antrean otomatis dengan format WL-001.']
    ],note:'Nama wajib diisi. Jumlah pack dibatasi 1–30. Nomor WhatsApp bersifat opsional.'},
    {id:'waiting',no:'03',title:'Antrean / Waiting List',group:'PENGELOLAAN ANTREAN',desc:'Cari tamu, saring status, dan buka detail kunjungan dari daftar antrean.',steps:[
      ['Buka Antrean','Tekan tombol + lalu pilih Antrean.'],
      ['Pilih tanggal antrean','Gunakan pemilih tanggal untuk melihat data pada hari yang dibutuhkan.'],
      ['Cari data tamu','Kolom pencarian menerima nama tamu atau nomor antrean.'],
      ['Gunakan filter status','Filter yang tersedia: Menunggu, Duduk, Selesai, dan Batal.'],
      ['Buka Detail','Pilih kartu tamu untuk melihat detail dan tindakan yang tersedia sesuai statusnya.']
    ]},
    {id:'reservations',no:'04',title:'Reservasi',group:'JADWAL KEDATANGAN',desc:'Kelola jadwal kedatangan melalui kalender, daftar reservasi, dan detail kode reservasi.',steps:[
      ['Buka menu Reservasi','Tekan tombol +, lalu pilih Reservasi.'],
      ['Pilih tanggal pada kalender','Gunakan navigasi bulan atau tombol Hari ini untuk memilih tanggal.'],
      ['Tekan + Reservasi','Isi Nama tamu dan Jumlah pack, kemudian tentukan Tanggal dan Jam reservasi.'],
      ['Isi preferensi kedatangan','WhatsApp dan catatan bersifat opsional. Preferensi smoking tersedia sebagai Non Smoking atau Smoking.'],
      ['Simpan dan periksa detail','Reservasi mendapat kode RSV-001 dan dapat dibuka dari daftar untuk melihat rinciannya.']
    ],note:'Tanggal reservasi tidak boleh berada di masa lalu. Detail reservasi menyediakan tindakan pembatalan dengan konfirmasi.'},
    {id:'history',no:'05',title:'Riwayat',group:'CATATAN KUNJUNGAN',desc:'Tinjau data kunjungan berdasarkan tanggal pendaftaran.',steps:[
      ['Buka Riwayat','Tekan tombol + lalu pilih Riwayat.'],
      ['Pilih tanggal riwayat','Gunakan pemilih tanggal untuk menentukan hari yang ingin ditinjau.'],
      ['Cari nama tamu','Masukkan nama tamu di kolom pencarian untuk menyaring daftar.'],
      ['Tinjau catatan kunjungan','Buka data yang dibutuhkan dan periksa informasi serta status akhirnya.']
    ]},
    {id:'settings',no:'06',title:'Pengaturan',group:'PREFERENSI OPERASIONAL',desc:'Lihat informasi workspace dan beberapa preferensi operasional.',steps:[
      ['Buka Pengaturan','Pilih Pengaturan dari navigasi utama.'],
      ['Periksa informasi operasional','Halaman menampilkan outlet aktif, aturan reset nomor antrean pukul 00.00 WIB, dan contoh format nomor WL.'],
      ['Atur Seating Time','Gunakan tombol minus atau plus untuk mengubah durasi, lalu tekan Simpan.'],
      ['Ekspor data','Gunakan tombol Ekspor untuk mengunduh data antrean hari ini dalam format CSV.']
    ]},
    {id:'master-items',no:'07',title:'Master Barang',group:'KATALOG BAHAN',desc:'Daftar bahan utama yang digunakan dalam resep WIP dan Menu.',steps:[
      ['Buka Master Barang','Pilih Master Barang dari navigasi workspace.'],
      ['Cari atau filter barang','Gunakan pencarian nama barang dan filter Aktif atau Nonaktif.'],
      ['Tambah barang','Isi Nama barang, Satuan dasar, Status, Harga referensi, dan Satuan harga.'],
      ['Atur kategori dan konversi','Centang Barang supply bila sesuai. Konversi satuan dapat ditambahkan jika dibutuhkan.'],
      ['Simpan dan periksa','Pastikan satuan dan harga referensi sesuai sebelum menyimpan karena data ini menjadi dasar perhitungan resep.']
    ],note:'Barang yang sudah digunakan pada resep dapat memiliki data terkait. Pastikan satuan dan faktor konversi benar sebelum menyimpan perubahan.'},
    {id:'wip',no:'08',title:'Resep WIP',group:'PRODUKSI & RESEP',desc:'Susun bahan atau WIP lain menjadi hasil produksi per batch.',steps:[
      ['Buka Resep WIP','Pilih Resep WIP dari menu cepat di area Master Barang.'],
      ['Tambah WIP','Isi Nama WIP, Hasil per batch, dan Satuan hasil.'],
      ['Susun komposisi resep','Pilih jenis item Barang atau WIP, cari item, lalu isi jumlah dan satuannya.'],
      ['Tambah komponen bila perlu','Gunakan Tambah baris untuk menambahkan komponen lain. Minimal satu komponen harus terisi.'],
      ['Simpan dan tinjau HPP','HPP per satuan hasil dihitung dari total biaya komponen dibagi hasil per batch.']
    ],note:'Rumus HPP per satuan hasil: total biaya komponen dibagi hasil per batch.'},
    {id:'menu',no:'09',title:'Menu & COGS',group:'COST OF GOODS SOLD',desc:'Gabungkan bahan dan/atau WIP per porsi untuk menghitung HPP serta margin.',steps:[
      ['Buka halaman Menu','Pilih Menu dari menu cepat di area Master Barang.'],
      ['Tambah menu','Isi Nama menu dan Harga jual per porsi.'],
      ['Isi komposisi per porsi','Pilih komponen Barang atau WIP, kemudian isi jumlah dan satuannya untuk setiap baris.'],
      ['Simpan menu','Gunakan Tambah baris untuk komponen tambahan, lalu tekan Simpan.'],
      ['Tinjau HPP dan margin','Kartu menu menampilkan harga jual, HPP, dan margin berdasarkan komposisi per porsi.']
    ],note:'Pastikan Master Barang dan Resep WIP yang dipakai memiliki satuan dan harga yang benar.'},
    {id:'divisions',no:'10',title:'Semua Divisi',group:'DEVELOPER VIEW',desc:'Ringkasan data per divisi dalam outlet terpilih.',restricted:'Developer',steps:[
      ['Buka ringkasan Semua Divisi','Halaman ini tersedia pada konteks Developer sesuai mode divisi yang aktif.'],
      ['Tinjau ringkasan','Gunakan daftar untuk melihat ringkasan data divisi di outlet terpilih.'],
      ['Pilih satu divisi untuk tindakan','Mode Semua Divisi bersifat lihat-saja. Untuk menambah, mengubah, atau memproses data, pilih satu divisi.']
    ],note:'Panduan ini dapat dibaca semua role. Halaman Semua Divisi tetap mengikuti pembatasan akses yang sudah ada.'},
    {id:'monitoring',no:'11',title:'User Monitoring',group:'PEMANTAUAN AKUN',desc:'Pantau sesi perangkat dan catatan aktivitas pengguna.',restricted:'Developer only',steps:[
      ['Buka User Monitoring','Menu ini hanya tersedia untuk role Developer.'],
      ['Tinjau Live Users','Tab Live Users menampilkan ringkasan pengguna dan perangkat yang sedang online.'],
      ['Buka Activity Log','Gunakan tab Activity Log untuk melihat catatan aktivitas yang tersedia.'],
      ['Gunakan filter dan muat ulang','Filter outlet dan tombol Muat ulang membantu memperbarui tampilan monitoring.']
    ],note:'Menampilkan panduan ini tidak memberikan hak akses baru ke halaman monitoring.'}
  ];

  const overview = [
    {no:'01',title:'Guest Operations',desc:'Pencatatan kunjungan, pengaturan antrean, reservasi, dan riwayat kedatangan.',flow:['Tambah Tamu','Antrean','Riwayat']},
    {no:'02',title:'Reservasi',desc:'Jadwal kedatangan dikelola melalui kalender, daftar, dan detail kode reservasi.',flow:['Buat RSV','Kalender','Detail']},
    {no:'03',title:'Master Data & COGS',desc:'Bangun daftar bahan, susun resep WIP, lalu gunakan komponen untuk menghitung HPP menu.',flow:['Master Barang','Resep WIP','Menu']}
  ];
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg>';
  const stepsHTML = steps => '<div class="ug-steps">' + steps.map((s,i) => '<div class="ug-step"><span>'+(i+1)+'</span><div><b>'+s[0]+'</b><p>'+s[1]+'</p></div></div>').join('') + '</div>';
  const shotHTML = feature => feature.image
    ? '<figure class="ug-shot"><button class="ug-shot-button" type="button" data-ug-open-shot aria-label="Perbesar screenshot Dashboard"><img src="assets/images/user-guide/dashboard.webp" alt="Screenshot dashboard Guest Operational, nama tamu telah disamarkan"><span class="ug-zoom-label">Perbesar screenshot ↗</span></button><figcaption>Dashboard asli · nama tamu disamarkan</figcaption></figure>'
    : '<div class="ug-shot ug-shot-pending"><div class="ug-shot-placeholder">'+icon+'<b>Screenshot asli '+feature.title+'</b><small>Belum tersedia di repository. Bagian ini menunggu tangkapan layar asli aplikasi.</small></div><p class="ug-shot-caption">Slot dokumentasi · bukan tampilan aplikasi</p></div>';
  const featureHTML = feature => '<section class="ug-section ug-reveal" id="ug-'+feature.id+'" data-ug-section><div class="ug-section-heading"><div><span class="ug-kicker">'+feature.no+' · '+feature.group+'</span><h2>'+feature.title+'</h2><p>'+feature.desc+'</p></div><span class="ug-section-number">'+feature.no+'</span></div>'+(feature.restricted?'<div class="ug-restriction">'+feature.restricted+' · pembatasan akses aplikasi tetap berlaku</div>':'')+'<div class="ug-feature-grid">'+shotHTML(feature)+stepsHTML(feature.steps)+'</div>'+(feature.note?'<div class="ug-note"><b>Catatan</b><span>'+feature.note+'</span></div>':'')+'</section>';

  const toc = [{id:'overview',label:'Overview sistem',no:'00'}].concat(features.map(f=>({id:f.id,label:f.title,no:f.no})));
  root.innerHTML = '<div class="ug-shell">'+
    '<header class="ug-hero ug-reveal"><div class="ug-hero-copy"><span class="ug-eyebrow">PUSAT BANTUAN · GUEST OPERATIONAL</span><h1 id="ug-title">Panduan kerja,<br><em>lebih mudah dipahami.</em></h1><p>Kenali area kerja New Project dan pelajari cara menggunakan setiap fitur melalui langkah yang sesuai dengan aplikasi.</p><div class="ug-hero-meta"><span><b>11</b> topik panduan</span><i></i><span>Mobile & desktop</span></div><a class="ug-primary-link" href="#ug-overview">Jelajahi panduan <span>↓</span></a></div><div class="ug-hero-media"><div class="ug-image-frame"><img src="assets/images/user-guide/dashboard.webp" alt="Screenshot dashboard Guest Operational"></div><span class="ug-media-caption">Dashboard · tampilan aplikasi</span></div></header>'+
    '<div class="ug-intro-row ug-reveal"><p>Mulai dari mencatat kedatangan tamu hingga menyusun komposisi menu. Pilih topik yang ingin dipelajari, atau ikuti panduan dari awal.</p><span>SCROLL UNTUK MENJELAJAHI　↓</span></div>'+
    '<div class="ug-layout"><aside class="ug-toc" aria-label="Daftar isi panduan"><div class="ug-toc-label">DAFTAR PANDUAN</div><nav class="ug-toc-links">'+toc.map((t,i)=>'<a href="#ug-'+t.id+'" '+(i===0?'class="is-active"':'')+'><span>'+t.no+'</span>'+t.label+'</a>').join('')+'</nav><div class="ug-toc-note"><b>Catatan akses</b><p>Beberapa halaman hanya tersedia untuk role atau divisi tertentu. Ikuti akses yang diberikan pada akun masing-masing.</p></div></aside>'+
    '<article class="ug-article"><section class="ug-section ug-reveal" id="ug-overview" data-ug-section><div class="ug-section-heading"><div><span class="ug-kicker">00 · GAMBARAN UMUM</span><h2>Bagaimana sistem saling terhubung?</h2><p>New Project mengelompokkan pekerjaan tamu dan pengelolaan data bahan. Setiap area memiliki alur masing-masing.</p></div><span class="ug-section-number">00</span></div><div class="ug-overview-list">'+overview.map(x=>'<article class="ug-flow"><div class="ug-flow-mark">'+x.no+'</div><div><b>'+x.title+'</b><p>'+x.desc+'</p><div class="ug-flow-steps">'+x.flow.map((v,i)=>(i?'<i>→</i>':'')+'<span>'+v+'</span>').join('')+'</div></div></article>').join('')+'</div><div class="ug-note"><b>Catatan fitur</b><span>Daily SO tidak ditampilkan sebagai menu aktif pada navigasi saat ini, sehingga belum dimasukkan ke panduan fitur aktif.</span></div></section>'+
    features.map(featureHTML).join('')+
    '<footer class="ug-ending ug-reveal"><span class="ug-eyebrow">PANDUAN NEW PROJECT</span><h2>Butuh bantuan saat menggunakan aplikasi?</h2><p>Hubungi Administrator atau Developer apabila menu, akses, atau tampilan di akun berbeda dari panduan ini.</p><a href="#ug-title" class="ug-back-top">Kembali ke awal ↑</a></footer></article></div></div>';

  const progress = document.getElementById('ug-progress-fill');
  const tocLinks = Array.from(page.querySelectorAll('.ug-toc-links a'));
  const sections = Array.from(page.querySelectorAll('[data-ug-section]'));
  const lightbox = document.getElementById('ug-lightbox');
  const closeButton = document.getElementById('ug-lightbox-close');
  let previousFocus = null;
  let raf = 0;
  function updateProgress() {
    raf = 0;
    const pageTop = window.scrollY + page.getBoundingClientRect().top;
    const max = Math.max(1, page.offsetHeight - window.innerHeight);
    const amount = Math.min(1,Math.max(0,(window.scrollY-pageTop)/max));
    if (progress) progress.style.transform = 'scaleX('+amount+')';
  }
  function onScroll() { if (!raf) raf = requestAnimationFrame(updateProgress); }
  function openZoom() { previousFocus=document.activeElement; lightbox.hidden=false; document.body.style.overflow='hidden'; closeButton.focus(); }
  function closeZoom() { if(lightbox.hidden)return; lightbox.hidden=true; document.body.style.overflow=''; previousFocus?.focus?.(); }
  page.addEventListener('click',event=>{
    if(event.target.closest('[data-ug-open-shot]')) openZoom();
    if(event.target===lightbox) closeZoom();
  });
  closeButton.addEventListener('click',closeZoom);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeZoom();});

  let revealObserver=null, sectionObserver=null;
  function activateObservers() {
    if (!page.classList.contains('active')) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      page.querySelectorAll('.ug-reveal').forEach(el=>el.classList.add('is-visible'));
    } else {
      page.classList.add('ug-motion-ready');
      if (!revealObserver) revealObserver = new IntersectionObserver(entries=>entries.forEach(entry=>{
        if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver.unobserve(entry.target);}
      }),{threshold:.12,rootMargin:'0px 0px -24px 0px'});
      page.querySelectorAll('.ug-reveal:not(.is-visible)').forEach(el=>revealObserver.observe(el));
    }
    if ('IntersectionObserver' in window && !sectionObserver) {
      sectionObserver = new IntersectionObserver(entries=>entries.forEach(entry=>{
        if(!entry.isIntersecting)return;
        tocLinks.forEach(link=>link.classList.toggle('is-active',link.hash==='#'+entry.target.id));
      }),{rootMargin:'-18% 0px -70% 0px'});
      sections.forEach(el=>sectionObserver.observe(el));
    }
    updateProgress();
  }
  const pageObserver = new MutationObserver(activateObservers);
  pageObserver.observe(page,{attributes:true,attributeFilter:['class']});
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll,{passive:true});
  tocLinks.forEach(link=>link.addEventListener('click',event=>{
    const target=page.querySelector(link.getAttribute('href'));
    if(!target)return;
    event.preventDefault();
    target.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }));
  activateObservers();
})();

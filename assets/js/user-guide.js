
(function () {
  const page = document.getElementById('page-user-guide');
  const root = document.getElementById('userGuideRoot');
  if (!page || !root || page.dataset.initialized === 'true') return;
  page.dataset.initialized = 'true';

  const features = [
    {
      id:'dashboard', no:'01', title:'Dashboard Guest', group:'GUEST OPERATIONS · UTAMA',
      desc:'Mulai dari sini untuk membaca kondisi kunjungan dan antrean pada tanggal operasional yang dipilih.',
      priority:true, shots:[{src:'dashboard.webp',title:'Dashboard Guest',alt:'Dashboard Guest Operational dengan nama tamu contoh',caption:'Ringkasan tamu, status kunjungan, tugas tertunda, dan antrean aktif.'}],
      steps:[
        ['Periksa konteks workspace','Header menunjukkan identitas workspace dan akun. Pemilihan outlet atau divisi mengikuti akses akun.'],
        ['Baca total kunjungan','Kartu utama menunjukkan total tamu pada tanggal terpilih, jumlah pack, dan rata-rata waktu tunggu.'],
        ['Pantau status kunjungan','Kartu Menunggu, Selesai, dan Batal membantu melihat kondisi operasional hari itu.'],
        ['Periksa tugas tertunda','Tamu yang belum diselesaikan dari hari sebelumnya tetap tercatat. Periksa dan selesaikan sesuai kondisi sebenarnya.'],
        ['Buka antrean aktif','Gunakan Lihat semua atau tombol Detail untuk membuka informasi dan tindakan pada tamu.']
      ],
      note:'Contoh nama pada screenshot bersifat fiktif. Contoh dokumentasi menggunakan pola Tamu Demo 001 sampai Tamu Demo 100; data ini hanya ilustrasi dan tidak menambah atau mengubah data workspace.'
    },
    {
      id:'add-guest', no:'02', title:'Tambah Tamu', group:'REGISTRASI TAMU',
      desc:'Catat kedatangan baru melalui tombol tambah pada Guest Operational.',
      shots:[{src:'add-guest.webp',title:'Form Tambah Tamu',alt:'Form tambah tamu dengan nama dan nomor contoh disamarkan',caption:'Form registrasi tamu dan pilihan status awal.'}],
      steps:[
        ['Buka menu cepat','Tekan tombol +, lalu pilih Tambah Tamu.'],
        ['Isi nama tamu','Nama tamu wajib diisi.'],
        ['Atur jumlah pack','Gunakan tombol minus dan plus untuk menyesuaikan jumlah orang.'],
        ['Isi nomor WhatsApp','Nomor WhatsApp bersifat opsional. Isi dengan nomor aktif bila perlu menghubungi tamu.'],
        ['Pilih status awal','Pilih Menunggu untuk masuk antrean, atau Langsung duduk bila tamu langsung menempati tempat duduk.'],
        ['Simpan tamu','Tekan Simpan tamu. Sistem membuat nomor antrean untuk kunjungan baru.']
      ],
      note:'Jika nomor WhatsApp tidak diisi, tindakan untuk menghubungi tamu melalui WhatsApp tidak tersedia.'
    },
    {
      id:'waiting', no:'03', title:'Waiting List', group:'PENGELOLAAN ANTREAN',
      desc:'Cari tamu, pantau posisi antrean, dan lakukan tindakan langsung dari daftar.',
      shots:[{src:'waiting-list.webp',title:'Daftar Waiting List',alt:'Halaman Waiting List dengan data tamu fiktif',caption:'Tanggal antrean, pencarian, filter status, dan kartu tamu.'}],
      steps:[
        ['Pilih tanggal antrean','Gunakan pemilih tanggal untuk melihat antrean pada hari yang diperlukan.'],
        ['Cari tamu','Masukkan nama atau nomor antrean pada kolom pencarian.'],
        ['Gunakan filter','Pilih Menunggu, Duduk, Selesai, atau Batal untuk menyaring daftar.'],
        ['Hubungi tamu','Tekan Panggil pada kartu tamu yang memiliki nomor WhatsApp. Aplikasi membuka chat WhatsApp dengan pesan yang sudah disiapkan. Periksa lalu kirim pesan dari WhatsApp.'],
        ['Dudukkan tamu','Tekan Duduk. Aplikasi meminta konfirmasi sebelum status berubah menjadi Duduk.'],
        ['Buka detail','Tekan Detail untuk melihat data, koreksi, waktu tunggu, dan riwayat perubahan.']
      ],
      note:'Saat tindakan Panggil dibuka untuk tamu berstatus Menunggu, status antrean dicatat sebagai Dipanggil. Aplikasi tidak mengirim pesan WhatsApp tanpa tindakan pengguna.'
    },
    {
      id:'guest-detail', no:'04', title:'Detail Tamu & Tindakan', group:'GUEST OPERATIONS · UTAMA',
      desc:'Bagian terpenting untuk memeriksa data tamu dan mengelola perubahan status dari awal hingga kunjungan selesai.',
      priority:true,
      shots:[
        {src:'guest-detail-waiting.webp',title:'Detail Tamu · Menunggu',alt:'Detail tamu dengan status Menunggu dan tombol Dudukkan tamu',caption:'Status Menunggu: periksa data, koreksi, batalkan, atau dudukkan tamu.'},
        {src:'guest-edit.webp',title:'Koreksi Data Tamu',alt:'Form koreksi data tamu dengan nama fiktif dan nomor kontak kosong',caption:'Koreksi nama, jumlah pack, atau WhatsApp. Alasan koreksi wajib diisi.'},
        {src:'guest-detail-seated.webp',title:'Detail Tamu · Duduk',alt:'Detail tamu dengan status Duduk dan tombol Selesaikan kunjungan',caption:'Status Duduk: pantau Seating Time dan selesaikan kunjungan setelah konfirmasi.'}
      ],
      steps:[
        ['Periksa identitas kunjungan','Detail menampilkan nomor antrean atau kode reservasi, tanggal, nama, jumlah pack, dan status.'],
        ['Pahami waktu berjalan','Saat Menunggu, halaman menampilkan Waiting Time. Setelah tamu Duduk, informasi berubah menjadi Seating Time.'],
        ['Hubungi lewat WhatsApp','Bila nomor valid tersedia, gunakan tombol WhatsApp. Chat dibuka dengan pesan yang sesuai status tamu; pengguna tetap menekan Kirim di aplikasi WhatsApp.'],
        ['Koreksi data dengan alasan','Tekan Koreksi data untuk memperbarui nama, jumlah pack, atau nomor WhatsApp. Isi Alasan koreksi sebelum menyimpan.'],
        ['Dudukkan tamu dengan konfirmasi','Tekan Dudukkan tamu, periksa dialog konfirmasi, lalu pilih tindakan setuju untuk mengubah status menjadi Duduk.'],
        ['Selesaikan kunjungan','Saat status sudah Duduk, tekan Selesaikan kunjungan. Konfirmasi ditampilkan sebelum status diubah menjadi Selesai.'],
        ['Periksa riwayat perubahan','Bagian Riwayat perubahan mencatat kejadian seperti Terdaftar, Dipanggil, Duduk, Dikoreksi, Selesai, atau Dibatalkan.']
      ],
      statusFlow:['Menunggu','Dipanggil','Duduk','Selesai'],
      note:'Tombol dan tindakan yang tersedia mengikuti status tamu. Kunjungan yang sudah Selesai atau Dibatalkan tidak dapat diproses kembali melalui tindakan status biasa.'
    },
    {
      id:'reservations', no:'05', title:'Reservasi', group:'JADWAL KEDATANGAN',
      desc:'Atur jadwal kedatangan dan pantau reservasi berdasarkan kalender.',
      shots:[{src:'reservations.webp',title:'Kalender dan daftar Reservasi',alt:'Halaman Reservasi dengan kalender dan data contoh',caption:'Kalender bulanan, indikator status, dan daftar reservasi tanggal terpilih.'}],
      steps:[
        ['Buka Reservasi','Tekan tombol + pada Guest Operational, lalu pilih Reservasi.'],
        ['Pilih tanggal','Gunakan kalender, tombol bulan sebelumnya/berikutnya, atau Hari ini.'],
        ['Tambah reservasi','Tekan + Reservasi, lalu isi nama tamu, jumlah pack, tanggal, dan jam kedatangan.'],
        ['Lengkapi informasi tambahan','Nomor WhatsApp, preferensi smoking, dan catatan dapat diisi sesuai kebutuhan.'],
        ['Periksa kode reservasi','Reservasi tersimpan dengan kode RSV dan muncul pada tanggal yang dipilih.'],
        ['Proses kedatangan','Buka detail reservasi. Gunakan Dudukkan tamu saat tamu tiba pada tanggal reservasinya, atau Batalkan bila jadwal dibatalkan.']
      ],
      note:'Kalender menggunakan penanda warna untuk status Menunggu, Duduk, dan Batal. Tindakan membatalkan reservasi meminta konfirmasi.'
    },
    {
      id:'history', no:'06', title:'Riwayat', group:'CATATAN KUNJUNGAN',
      desc:'Tinjau catatan antrean berdasarkan tanggal pendaftaran.',
      shots:[{src:'history.webp',title:'Riwayat kunjungan',alt:'Halaman Riwayat dengan data tamu fiktif',caption:'Pilih tanggal, cari nama, lalu buka detail kunjungan.'}],
      steps:[
        ['Buka Riwayat','Pilih Riwayat dari menu cepat Guest Operational.'],
        ['Pilih tanggal riwayat','Tentukan tanggal pendaftaran yang ingin ditinjau.'],
        ['Cari nama tamu','Gunakan kolom pencarian untuk mempersempit daftar.'],
        ['Buka detail kunjungan','Periksa nomor antrean, jumlah pack, waktu daftar, waktu tunggu, dan status.']
      ],
      note:'Riwayat membantu meninjau kunjungan terdahulu. Untuk melakukan tindakan operasional, gunakan halaman dan tindakan yang tersedia sesuai status tamu.'
    },
    {
      id:'settings', no:'07', title:'Pengaturan', group:'PREFERENSI OPERASIONAL',
      desc:'Lihat informasi outlet dan atur preferensi operasional yang tersedia.',
      shots:[{src:'settings.webp',title:'Pengaturan workspace',alt:'Halaman Pengaturan dengan informasi outlet dan preferensi operasional',caption:'Outlet aktif, aturan nomor antrean, durasi Seating Time, dan ekspor CSV.'}],
      steps:[
        ['Periksa outlet aktif','Lihat outlet yang sedang digunakan oleh workspace.'],
        ['Pahami reset nomor antrean','Nomor antrean diatur ulang otomatis setiap pukul 00.00 WIB.'],
        ['Atur format nomor','Contoh format nomor antrean ditampilkan sebagai WL-001, WL-002, dan seterusnya.'],
        ['Atur durasi Seating Time','Gunakan tombol minus atau plus, lalu tekan Simpan untuk menyimpan durasi.'],
        ['Ekspor data antrean','Tekan Ekspor untuk mengunduh data antrean hari ini dalam format CSV.']
      ],
      note:'Bagian penyimpanan menjelaskan bahwa data workspace tersimpan melalui Supabase dan mengikuti izin akun. Panduan ini tidak mengubah pengaturan backend.'
    },
    {
      id:'master-items', no:'08', title:'Master Barang', group:'KATALOG BAHAN',
      desc:'Kelola bahan utama yang menjadi dasar komposisi resep WIP dan Menu.',
      shots:[
        {src:'master-items.webp',title:'Daftar Master Barang',alt:'Daftar Master Barang dengan bahan contoh',caption:'Ringkasan barang, pencarian, filter status, dan harga referensi.'},
        {src:'add-item.webp',title:'Form Tambah Barang',alt:'Form tambah barang dengan kolom data contoh',caption:'Nama, satuan dasar, status, harga referensi, kategori supply, dan konversi.'}
      ],
      steps:[
        ['Cari atau filter barang','Gunakan pencarian nama barang dan filter Aktif atau Nonaktif.'],
        ['Tambah barang','Isi nama barang, satuan dasar, harga referensi, dan satuan harga.'],
        ['Tentukan status dan kategori','Pilih status barang. Centang Barang supply bila bahan termasuk kategori supply.'],
        ['Atur konversi satuan','Tambahkan konversi bila satuan pembelian berbeda dari satuan dasar.'],
        ['Periksa harga referensi','Pastikan harga dan satuan benar karena nilai referensi digunakan sebagai dasar estimasi HPP.'],
        ['Kelola daftar','Gunakan Download Excel untuk ekspor, serta Edit atau Nonaktifkan pada barang yang dipilih.']
      ],
      note:'Perubahan satuan dan konversi dapat memengaruhi perhitungan resep atau menu yang menggunakan barang tersebut. Periksa kembali sebelum menyimpan.'
    },
    {
      id:'wip', no:'09', title:'Resep WIP', group:'PRODUKSI & RESEP',
      desc:'Susun komposisi bahan untuk membuat hasil produksi per batch.',
      shots:[
        {src:'wip-list.webp',title:'Daftar Resep WIP',alt:'Daftar Resep WIP dengan resep contoh',caption:'Ringkasan WIP, status, HPP per satuan hasil, dan biaya batch.'},
        {src:'add-wip.webp',title:'Form Tambah WIP',alt:'Form Tambah WIP dengan komposisi item contoh kosong',caption:'Tentukan hasil batch, satuan hasil, dan komponen resep.'}
      ],
      steps:[
        ['Cari atau filter resep','Gunakan pencarian nama WIP dan filter Aktif atau Nonaktif.'],
        ['Tambah WIP','Isi nama WIP, hasil per batch, dan satuan hasil.'],
        ['Susun komposisi','Pilih jenis item Barang atau WIP, cari item, lalu isi jumlah dan satuannya.'],
        ['Tambahkan komponen','Masukkan komponen lain sesuai resep sebelum menyimpan.'],
        ['Tinjau HPP','Daftar menampilkan biaya batch dan HPP per satuan hasil berdasarkan harga referensi komponen.'],
        ['Kelola resep','Gunakan Download Excel, Edit, atau Nonaktifkan sesuai kebutuhan.']
      ],
      note:'Rumus dasar: HPP per satuan hasil merupakan total biaya komponen dibagi jumlah hasil per batch.'
    },
    {
      id:'menu', no:'10', title:'Menu & COGS', group:'COST OF GOODS SOLD',
      desc:'Susun komposisi per porsi untuk menghitung HPP dan margin menu.',
      shots:[{src:'menu-list.webp',title:'Daftar Menu & COGS',alt:'Daftar menu dengan harga jual, HPP, dan margin contoh',caption:'Harga jual per porsi, HPP per porsi, dan margin.'}],
      steps:[
        ['Cari atau filter menu','Gunakan pencarian nama menu dan filter Aktif atau Nonaktif.'],
        ['Tambah menu','Isi nama menu dan harga jual per porsi.'],
        ['Susun komposisi','Pilih komponen Barang atau WIP, lalu masukkan jumlah dan satuannya untuk setiap porsi.'],
        ['Simpan dan tinjau hasil','Periksa harga jual, HPP per porsi, serta margin persentase dan nominal.'],
        ['Kelola data menu','Gunakan Download Excel, Edit, atau Nonaktifkan sesuai kebutuhan.']
      ],
      note:'HPP dan margin merupakan estimasi berdasarkan harga referensi Master Barang serta komposisi yang digunakan.'
    }
  ];

  const overview = [
    {no:'01',title:'Guest Operations',desc:'Area utama untuk mencatat kedatangan, memanggil antrean, mengelola status duduk, dan menutup kunjungan.',flow:['Dashboard','Tambah Tamu','Waiting List','Detail Tamu','Riwayat']},
    {no:'02',title:'Reservasi',desc:'Jadwal kedatangan dikelola lewat kalender, daftar berdasarkan tanggal, dan detail kode reservasi.',flow:['Buat RSV','Kalender','Kedatangan']},
    {no:'03',title:'Master Data & COGS',desc:'Bahan utama digunakan untuk menyusun resep WIP, lalu komposisinya menjadi dasar HPP menu.',flow:['Master Barang','Resep WIP','Menu & COGS']},
    {no:'04',title:'Pengaturan',desc:'Preferensi operasional seperti durasi Seating Time dan ekspor data antrean.',flow:['Outlet','Seating Time','Ekspor CSV']}
  ];

  const escapeHTML = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const docIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>';
  const stepsHTML = steps => '<div class="ug-steps">' + steps.map((step,index) => '<div class="ug-step"><span>'+(index+1)+'</span><div><b>'+escapeHTML(step[0])+'</b><p>'+escapeHTML(step[1])+'</p></div></div>').join('') + '</div>';
  const shotHTML = shot => '<figure class="ug-shot"><button class="ug-shot-button" type="button" data-ug-open-shot data-ug-src="assets/images/user-guide/'+escapeHTML(shot.src)+'" data-ug-title="'+escapeHTML(shot.title)+'" data-ug-alt="'+escapeHTML(shot.alt)+'" aria-label="Perbesar '+escapeHTML(shot.title)+'"><img src="assets/images/user-guide/'+escapeHTML(shot.src)+'" alt="'+escapeHTML(shot.alt)+'" loading="lazy"><span class="ug-zoom-label">Perbesar ↗</span></button><figcaption>'+escapeHTML(shot.caption)+'</figcaption></figure>';
  const featureHTML = feature => {
    const gallery = '<div class="ug-shot-gallery'+(feature.shots.length > 1 ? ' ug-shot-gallery-multi' : '')+'">'+feature.shots.map(shotHTML).join('')+'</div>';
    const statusFlow = feature.statusFlow ? '<div class="ug-status-flow" aria-label="Alur status kunjungan">'+feature.statusFlow.map((label,index)=>(index?'<i>→</i>':'')+'<span>'+escapeHTML(label)+'</span>').join('')+'</div>' : '';
    const note = feature.note ? '<div class="ug-note"><b>Catatan</b><span>'+escapeHTML(feature.note)+'</span></div>' : '';
    return '<section class="ug-section ug-reveal'+(feature.priority?' ug-section-primary':'')+'" id="ug-'+feature.id+'" data-ug-section><div class="ug-section-heading"><div><span class="ug-kicker'+(feature.priority?' ug-kicker-primary':'')+'">'+feature.no+' · '+escapeHTML(feature.group)+'</span><h2>'+escapeHTML(feature.title)+'</h2><p>'+escapeHTML(feature.desc)+'</p></div><span class="ug-section-number">'+feature.no+'</span></div>'+(feature.priority?'<span class="ug-priority-label">FOKUS UTAMA · GUEST OPERATIONS</span>':'')+statusFlow+'<div class="ug-feature-grid">'+gallery+stepsHTML(feature.steps)+'</div>'+note+'</section>';
  };
  const toc = [{id:'overview',label:'Overview sistem',no:'00'}].concat(features.map(feature=>({id:feature.id,label:feature.title,no:feature.no})));
  const overviewHTML = overview.map(item => '<article class="ug-flow"><div class="ug-flow-mark">'+item.no+'</div><div class="ug-flow-body"><b>'+escapeHTML(item.title)+'</b><p>'+escapeHTML(item.desc)+'</p><div class="ug-flow-steps">'+item.flow.map((step,index)=>(index?'<i>→</i>':'')+'<span>'+escapeHTML(step)+'</span>').join('')+'</div></div></article>').join('');

  root.innerHTML = '<div class="ug-shell">'+
    '<header class="ug-hero ug-reveal"><div class="ug-hero-copy"><span class="ug-eyebrow">PUSAT BANTUAN · GUEST OPERATIONS</span><h1 id="ug-title">Guest Operations,<br><em>lebih mudah dipahami.</em></h1><p>Panduan langkah demi langkah untuk mencatat tamu, mengelola antrean, memproses reservasi, dan membaca data operasional.</p><div class="ug-hero-meta"><span><b>'+features.length+'</b> topik panduan</span><i></i><span>Mobile & desktop</span></div><a class="ug-primary-link" href="#ug-overview">Jelajahi panduan <span>↓</span></a></div><div class="ug-hero-media"><div class="ug-image-frame"><img src="assets/images/user-guide/dashboard.webp" alt="Dashboard Guest Operational dengan data nama fiktif"></div><span class="ug-media-caption">Dashboard Guest · contoh data fiktif</span></div></header>'+
    '<div class="ug-intro-row ug-reveal"><p>Mulai dari Dashboard Guest dan Detail Tamu sebagai alur utama. Panduan Master Barang, Resep WIP, Menu & COGS, serta Pengaturan tersedia sebagai materi pendukung.</p><span>GULIR UNTUK MENJELAJAHI ↓</span></div>'+
    '<div class="ug-layout"><aside class="ug-toc" aria-label="Daftar isi panduan"><div class="ug-toc-label">DAFTAR PANDUAN</div><nav class="ug-toc-links">'+toc.map((item,index)=>'<a href="#ug-'+item.id+'" '+(index===0?'class="is-active"':'')+'><span>'+item.no+'</span>'+escapeHTML(item.label)+'</a>').join('')+'</nav><div class="ug-toc-note"><b>Catatan data contoh</b><p>Nama dan nomor kontak pada screenshot telah disamarkan. Contoh data tamu menggunakan nama fiktif.</p></div></aside>'+
    '<article class="ug-article"><section class="ug-section ug-reveal" id="ug-overview" data-ug-section><div class="ug-section-heading"><div><span class="ug-kicker">00 · GAMBARAN UMUM</span><h2>Mulai dari Guest Operations</h2><p>Ikuti alur kerja utama terlebih dahulu. Bagian lain membantu menjaga data bahan, resep, dan harga menu tetap konsisten.</p></div><span class="ug-section-number">00</span></div><div class="ug-overview-list">'+overviewHTML+'</div><div class="ug-note"><b>Prioritas panduan</b><span>Dashboard Guest dan Detail Tamu mendapat penjelasan paling lengkap. Materi lain dibuat lebih ringkas sebagai panduan pendukung.</span></div></section>'+
    features.map(featureHTML).join('')+
    '<footer class="ug-ending ug-reveal"><span class="ug-eyebrow">PANDUAN NEW PROJECT</span><h2>Gunakan data dengan teliti.</h2><p>Pastikan identitas tamu, jumlah pack, nomor WhatsApp, status kunjungan, satuan bahan, dan harga referensi sudah benar sebelum menyimpan perubahan.</p><a href="#ug-title" class="ug-back-top">Kembali ke awal ↑</a></footer></article></div></div>';

  const progress = document.getElementById('ug-progress-fill');
  const tocLinks = Array.from(page.querySelectorAll('.ug-toc-links a'));
  const sections = Array.from(page.querySelectorAll('[data-ug-section]'));
  const lightbox = document.getElementById('ug-lightbox');
  const closeButton = document.getElementById('ug-lightbox-close');
  const lightboxImage = lightbox.querySelector('img');
  const lightboxTitle = lightbox.querySelector('.ug-lightbox-head span');
  let previousFocus = null;
  let previousOverflow = '';
  let raf = 0;

  function updateProgress() {
    raf = 0;
    const pageTop = window.scrollY + page.getBoundingClientRect().top;
    const max = Math.max(1,page.offsetHeight-window.innerHeight);
    const amount = Math.min(1,Math.max(0,(window.scrollY-pageTop)/max));
    if(progress) progress.style.transform='scaleX('+amount+')';
  }
  function onScroll() { if(!raf) raf=requestAnimationFrame(updateProgress); }
  function openZoom(button) {
    previousFocus=button;
    previousOverflow=document.body.style.overflow;
    lightboxImage.src=button.dataset.ugSrc;
    lightboxImage.alt=button.dataset.ugAlt || button.dataset.ugTitle || 'Screenshot panduan';
    lightboxTitle.textContent=button.dataset.ugTitle || 'Screenshot panduan';
    lightbox.hidden=false;
    document.body.style.overflow='hidden';
    closeButton.focus();
  }
  function closeZoom() {
    if(lightbox.hidden) return;
    lightbox.hidden=true;
    document.body.style.overflow=previousOverflow;
    if(previousFocus && typeof previousFocus.focus==='function') previousFocus.focus();
  }
  page.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-ug-open-shot]');
    if(trigger) openZoom(trigger);
    if(event.target===lightbox) closeZoom();
  });
  closeButton.addEventListener('click',closeZoom);
  document.addEventListener('keydown',event=>{if(event.key==='Escape') closeZoom();});

  let revealObserver=null;
  let sectionObserver=null;
  function activateObservers() {
    if(!page.classList.contains('active')) return;
    const reduce=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce || !('IntersectionObserver' in window)) {
      page.querySelectorAll('.ug-reveal').forEach(element=>element.classList.add('is-visible'));
    } else {
      page.classList.add('ug-motion-ready');
      if(!revealObserver) revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
        if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver.unobserve(entry.target);}
      }),{threshold:.12,rootMargin:'0px 0px -24px 0px'});
      page.querySelectorAll('.ug-reveal:not(.is-visible)').forEach(element=>revealObserver.observe(element));
    }
    if('IntersectionObserver' in window && !sectionObserver) {
      sectionObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
        if(!entry.isIntersecting) return;
        tocLinks.forEach(link=>link.classList.toggle('is-active',link.hash==='#'+entry.target.id));
      }),{rootMargin:'-18% 0px -70% 0px'});
      sections.forEach(section=>sectionObserver.observe(section));
    }
    updateProgress();
  }
  const pageObserver=new MutationObserver(activateObservers);
  pageObserver.observe(page,{attributes:true,attributeFilter:['class']});
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll,{passive:true});
  tocLinks.forEach(link=>link.addEventListener('click',event=>{
    const target=page.querySelector(link.getAttribute('href'));
    if(!target) return;
    event.preventDefault();
    const reduce=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
  }));
  activateObservers();
})();

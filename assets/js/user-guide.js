
(function () {
  const page = document.getElementById('page-user-guide');
  const root = document.getElementById('userGuideRoot');
  if (!page || !root || window.UserGuideInitialized) return;

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

  const vText=(x,y,value,size=12,color='#111225',bold=600,anchor='start')=>'<text x="'+x+'" y="'+y+'" font-size="'+size+'" font-weight="'+bold+'" fill="'+color+'" text-anchor="'+anchor+'" font-family="Arial,sans-serif">'+escapeHTML(value)+'</text>';
  const vRect=(x,y,w,h,color='#fff',radius=12,stroke='none')=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+radius+'" fill="'+color+'"'+(stroke==='none'?'':' stroke="'+stroke+'"')+'/>';
  const vPill=(x,y,w,label,fill='#fff',color='#111225')=>vRect(x,y,w,28,fill,14)+vText(x+w/2,y+18,label,10,color,700,'middle');
  const vButton=(x,y,w,label,dark=false)=>vRect(x,y,w,42,dark?'#111225':'#f6f6f1',11,dark?'none':'#e8e8e2')+vText(x+w/2,y+26,label,11,dark?'#fff':'#303044',700,'middle');
  const vField=(y,label,value,placeholder=false)=>vText(26,y,label,10,'#858594',700)+vRect(22,y+9,376,48,'#f7f7f4',10)+vText(38,y+39,value,12,placeholder?'#a4a4ad':'#303044',placeholder?400:600);
  const visualConfig={
    'dashboard.webp':{app:'DASHBOARD',title:'Dashboard Guest',sub:'Ringkasan kunjungan dan antrean.',mode:'dashboard'},
    'add-guest.webp':{app:'GUEST OPS',title:'Tambah Tamu',sub:'Form pencatatan kedatangan baru.',mode:'form',fields:[['Nama tamu *','Masukkan nama tamu'],['Jumlah pack *','2 orang'],['Nomor WhatsApp','08xxxxxxxxxx'],['Status awal','Menunggu / Langsung duduk']]},
    'waiting-list.webp':{app:'ANTREAN',title:'Waiting List',sub:'Pantau antrean dan proses tamu.',mode:'waiting'},
    'guest-detail-waiting.webp':{app:'ANTREAN',title:'Detail Tamu',sub:'Status Menunggu',mode:'detail'},
    'guest-edit.webp':{app:'ANTREAN',title:'Koreksi Data Tamu',sub:'Perbarui data dengan alasan koreksi.',mode:'form',fields:[['Nama tamu *','Nadia Putri'],['Jumlah pack *','2 orang'],['WhatsApp','Tidak diisi'],['Alasan koreksi *','Tulis alasan perubahan']]},
    'guest-detail-seated.webp':{app:'ANTREAN',title:'Detail Tamu',sub:'Status Duduk',mode:'seated'},
    'reservations.webp':{app:'RESERVASI',title:'Reservasi',sub:'Kalender dan jadwal kedatangan.',mode:'calendar'},
    'history.webp':{app:'RIWAYAT',title:'Riwayat',sub:'Catatan antrean berdasarkan tanggal.',mode:'history'},
    'settings.webp':{app:'PENGATURAN',title:'Pengaturan',sub:'Preferensi outlet dan operasional.',mode:'settings'},
    'master-items.webp':{app:'MASTER BARANG',title:'Master Barang',sub:'Daftar bahan utama dan harga referensi.',mode:'items'},
    'add-item.webp':{app:'MASTER BARANG',title:'Tambah Barang',sub:'Data bahan dan konversi satuan.',mode:'form',fields:[['Nama barang *','Nama bahan baru'],['Satuan dasar *','Pilih satuan'],['Harga referensi *','Rp 0'],['Satuan harga *','Pilih satuan harga'],['Kategori','Barang supply']]},
    'wip-list.webp':{app:'WIP PRODUKSI',title:'Resep WIP',sub:'Daftar resep dan HPP per batch.',mode:'wip'},
    'add-wip.webp':{app:'WIP PRODUKSI',title:'Tambah WIP',sub:'Hasil batch dan komposisi resep.',mode:'recipe'},
    'menu-list.webp':{app:'MENU & RESEP',title:'Menu & COGS',sub:'Harga jual, HPP, dan margin menu.',mode:'menu'}
  };
  function renderVisual(src){
    const c=visualConfig[src]||visualConfig['dashboard.webp'];
    let s=vRect(0,0,420,780,'#f6f6f1',0)+vRect(20,16,38,38,'#111225',19)+
      '<path d="M31 39c0-7 4-11 8-11s8 4 8 11M34 28c0-4 2-6 5-6s5 2 5 6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'+
      vText(70,31,c.app,13,'#111225',800)+vText(70,46,'LAZY JENNIE · SERVICE',8,'#858594',600)+vRect(330,17,38,36,'#e9e6f7',18)+vText(349,40,'AP',12,'#111225',700,'middle')+vRect(376,17,30,36,'#111225',13)+vText(391,41,'≡',21,'#fff',600,'middle')+
      vText(22,76,'OUTLET',8,'#858594',800)+vText(226,76,'DIVISI',8,'#858594',800)+vRect(20,84,182,48,'#fff',12,'#e8e8e2')+vText(34,113,'Lazy Jennie',13,'#27283a',700)+vRect(214,84,186,48,'#fff',12,'#e8e8e2')+vText(229,113,'Service',13,'#27283a',700)+
      vPill(20,151,156,'←  Guest Operational','#fff','#414154')+vText(22,207,c.title,25,'#111225',800)+vText(22,230,c.sub,10,'#858594',500);
    if(c.mode==='dashboard'){
      s+=vRect(20,250,380,126,'#d9ee8c',18)+vText(40,277,'Total tamu pada tanggal dipilih',11,'#586342',600)+vText(40,331,'2',42,'#111225',800)+vText(40,356,'4 total pack  ·  rata-rata tunggu',11,'#586342',600);
      [['MENUNGGU','2','#f3efcf'],['SELESAI','0','#e3f2e9'],['BATAL','0','#f7e9e9']].forEach((a,i)=>{const x=20+i*128;s+=vRect(x,392,120,105,'#fff',15)+vText(x+14,418,a[0],9,'#858594',800)+vRect(x+85,402,22,22,a[2],11)+vText(x+14,464,a[1],28,'#111225',800)+vText(x+14,483,i===0?'Antrean aktif':i===1?'Kunjungan selesai':'Dibatalkan',9,'#858594',500);});
      s+=vRect(20,515,380,118,'#fbf1d7',14)+vText(36,540,'⚠  Tugas tertunda',11,'#8c6b2d',800);
      ['WL-001 · Nadia Putri','WL-002 · Dimas Pratama','WL-003 · Tamu Demo 003'].forEach((a,i)=>s+=vText(36,566+i*22,a,10,'#4c4b42',600));
      s+=vText(22,670,'Antrean aktif',16,'#111225',800)+vRect(20,687,380,72,'#fff',14)+vRect(32,698,48,50,'#eef7c7',10)+vText(56,728,'WL-001',9,'#4c5b32',800,'middle')+vText(94,718,'Nadia Putri',12,'#111225',700)+vText(94,739,'2 pack · Waiting time 20 menit',9,'#858594',500);
    } else if(c.mode==='form'){
      s+=vRect(7,195,406,570,'#fff',24,'#e8e8e2')+vRect(184,208,52,5,'#d4d4d4',3)+vText(24,251,c.title,19,'#111225',800)+vText(390,251,'×',22,'#858594',400,'middle');
      c.fields.forEach((f,i)=>{const y=292+i*74;s+=vField(y,f[0],f[1],f[1].includes('Masukkan')||f[1].includes('Pilih')||f[1].includes('Tulis'));});
      const actionY=292+c.fields.length*74+7;s+=vButton(22,Math.min(actionY,674),174,'Kembali')+vButton(214,Math.min(actionY,674),184,c.title==='Tambah Tamu'?'Simpan tamu':c.title==='Koreksi Data Tamu'?'Simpan koreksi':c.title==='Tambah Barang'?'Simpan barang':'Simpan WIP',true);
    } else if(c.mode==='waiting'||c.mode==='history'){
      s+=vRect(20,251,380,58,'#fff',13)+vText(36,275,c.mode==='waiting'?'TANGGAL ANTREAN':'TANGGAL RIWAYAT',8,'#858594',700)+vText(36,297,'8 November 2026',14,'#111225',700)+vRect(20,322,380,48,'#fff',12)+vText(40,352,'⌕  Cari nama atau nomor antrean',11,'#a2a2aa',500);
      if(c.mode==='waiting')['Menunggu','Duduk','Selesai','Batal'].forEach((a,i)=>s+=vPill(20+i*96,392,88,a,i===0?'#111225':'#fff',i===0?'#fff':'#858594'));
      [['WL-001','Nadia Putri','2 pack · 11.24','49 menit'],['WL-002','Dimas Pratama','2 pack · 11.55','18 menit']].forEach((a,i)=>{const y=(c.mode==='waiting'?438:392)+i*(c.mode==='waiting'?140:137);s+=vRect(20,y,380,118,'#fff',15)+vRect(31,y+12,65,94,'#eef7c7',11)+vText(63,y+64,a[0],9,'#4c5b32',800,'middle')+vText(111,y+34,a[1],14,'#111225',800)+vText(111,y+56,a[2],9,'#858594',500)+vText(111,y+83,'Waiting time '+a[3],10,'#858594',500)+vPill(305,y+71,72,'Detail','#f6f6f1');});
    } else if(c.mode==='detail'||c.mode==='seated'){
      s+=vRect(7,212,406,554,'#fff',24,'#e8e8e2')+vRect(184,224,52,5,'#d4d4d4',3)+vText(24,267,'Detail tamu',20,'#111225',800)+vText(390,266,'×',22,'#858594',400,'middle')+vRect(22,290,376,94,'#d9ee8c',17)+vText(210,315,'NOMOR ANTREAN',8,'#586342',700,'middle')+vText(210,354,'WL-001',30,'#111225',800,'middle')+vText(210,372,'Minggu, 8 November',9,'#586342',500,'middle')+vText(24,417,'Nadia Putri',16,'#111225',800)+vText(24,449,'Jumlah pack',8,'#858594',600)+vText(24,469,'2 orang',12,'#111225',700)+vText(220,449,'Status',8,'#858594',600)+vText(220,469,c.mode==='seated'?'Duduk':'Menunggu',12,'#111225',700)+vText(24,513,'Waktu daftar',8,'#858594',600)+vText(24,534,'11.24',12,'#111225',700)+vText(220,513,c.mode==='seated'?'Seating time':'Waiting time',8,'#858594',600)+vText(220,534,c.mode==='seated'?'89:50':'52 menit',12,'#111225',700)+vText(24,572,'WhatsApp',8,'#858594',600)+vText(24,592,'Tidak diisi',11,'#111225',600)+vButton(22,612,376,'Koreksi data')+(c.mode==='seated'?vButton(22,663,376,'Selesaikan kunjungan',true):vButton(22,663,174,'Batalkan')+vButton(214,663,184,'Dudukkan tamu',true))+vText(24,725,'Riwayat perubahan · Terdaftar',9,'#858594',600);
    } else if(c.mode==='calendar'){
      s+=vRect(20,250,380,66,'#fff',14)+vText(36,276,'KALENDER RESERVASI',8,'#858594',800)+vText(36,301,'November 2026',17,'#111225',800)+vPill(313,267,70,'Hari ini','#f6f6f1');
      ['Min','Sen','Sel','Rab','Kam','Jum','Sab'].forEach((a,i)=>s+=vText(47+i*54,356,a,9,'#858594',700,'middle'));
      for(let r=0;r<5;r++)for(let col=0;col<7;col++){const n=r*7+col+1;if(n>30)continue;const x=25+col*53,y=370+r*43;s+=vRect(x,y,44,34,n===8?'#d9ee8c':'#fff',9,n===8?'#bad26a':'#ecece6')+vText(x+22,y+22,String(n),10,'#111225',n===8?800:500,'middle');}
      s+=vText(22,610,'Minggu, 8 November 2026',14,'#111225',800)+vButton(262,588,138,'+ Reservasi',true)+vRect(20,635,380,112,'#fff',14)+vText(36,659,'RSV-001',8,'#858594',800)+vText(36,685,'Nadia Putri',14,'#111225',800)+vText(36,706,'2 pack · Non Smoking',9,'#858594',500)+vRect(324,652,58,58,'#eef7c7',12)+vText(353,678,'19:00',14,'#4c5b32',800,'middle');
    } else if(c.mode==='settings'){
      [['Outlet aktif','LAZY JENNIE','AKTIF'],['Reset nomor antrean','Setiap hari pukul 00.00 WIB','OTOMATIS'],['Format nomor','WL-001, WL-002, ...','WL']].forEach((a,i)=>{const y=258+i*94;s+=vRect(20,y,380,78,'#fff',14)+vText(38,y+25,a[0],12,'#111225',800)+vText(38,y+49,a[1],9,'#858594',500)+vPill(318,y+22,66,a[2],'#eef7c7','#4c5b32');});
      s+=vRect(20,555,380,88,'#fff',14)+vText(38,581,'Durasi Seating Time',12,'#111225',800)+vPill(38,595,40,'−','#f6f6f1')+vText(210,622,'90 menit',14,'#111225',800,'middle')+vPill(340,595,40,'+','#f6f6f1')+vButton(20,665,380,'Ekspor data antrean · CSV');
    } else {
      const stats=c.mode==='items'?['82','75','7']:c.mode==='wip'?['32','30','2']:['58','54','4'];
      const title=c.mode==='items'?'TOTAL BARANG':c.mode==='wip'?'TOTAL RESEP':'TOTAL MENU';
      s+=vRect(20,250,380,76,'#fff',14)+vText(40,275,title,8,'#858594',700)+vText(40,309,stats[0],28,'#111225',800)+vText(180,275,'AKTIF',8,'#858594',700)+vText(180,309,stats[1],28,'#111225',800)+vText(310,275,'NONAKTIF',8,'#858594',700)+vText(310,309,stats[2],28,'#111225',800);
      s+=vRect(20,340,380,46,'#fff',12)+vText(38,369,c.mode==='items'?'⌕  Cari nama barang...':c.mode==='wip'?'⌕  Cari nama WIP...':'⌕  Cari nama menu...',11,'#a2a2aa',500)+vPill(20,400,67,'Aktif','#111225','#fff')+vPill(95,400,88,'Nonaktif','#fff','#858594')+vButton(278,394,122,c.mode==='items'?'+ Tambah barang':c.mode==='wip'?'+ Tambah WIP':'+ Tambah menu',true);
      const rows=c.mode==='items'?[['Apple Juice','Rp 47.492 / L'],['Beans Espresso','Rp 295.000 / Kg'],['Beans Origin','Rp 1 / Ml']]:c.mode==='wip'?[['Base Cola','Rp 40.605 / Kg'],['Base Cream','Rp 53.136 / L'],['Base Cream Float','Rp 62.071 / L']]:[['AIR MINERAL','Rp 10.000 · HPP Rp 2.000'],['AMERICANO HOT','Rp 28.000 · HPP Rp 9.500'],['CAPPUCCINO','Rp 32.000 · HPP Rp 11.200']];
      rows.forEach((a,i)=>{const y=444+i*94;s+=vRect(20,y,380,80,'#fff',13)+vText(38,y+28,a[0],13,'#111225',800)+vText(38,y+51,a[1],9,'#858594',500)+vPill(310,y+14,70,'Aktif','#eef7c7','#4c5b32')+vText(330,y+65,'Edit  Detail',9,'#858594',600,'middle');});
    }
    return '<svg class="ug-visual-svg" viewBox="0 0 420 780" role="img" aria-label="Ilustrasi antarmuka '+escapeHTML(c.title)+'" xmlns="http://www.w3.org/2000/svg">'+s+'</svg>';
  }
  const docIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>';
  const stepsHTML = steps => '<div class="ug-steps">' + steps.map((step,index) => '<div class="ug-step"><span>'+(index+1)+'</span><div><b>'+escapeHTML(step[0])+'</b><p>'+escapeHTML(step[1])+'</p></div></div>').join('') + '</div>';
  const shotHTML = shot => '<figure class="ug-shot"><button class="ug-shot-button" type="button" data-ug-open-shot data-ug-visual="'+escapeHTML(shot.src)+'" data-ug-title="'+escapeHTML(shot.title)+'" aria-label="Perbesar ilustrasi '+escapeHTML(shot.title)+'">'+renderVisual(shot.src)+'<span class="ug-zoom-label">Perbesar ↗</span></button><figcaption>'+escapeHTML(shot.caption)+'</figcaption></figure>';
  const featureHTML = feature => {
    const gallery = '<div class="ug-shot-gallery'+(feature.shots.length > 1 ? ' ug-shot-gallery-multi' : '')+'">'+feature.shots.map(shotHTML).join('')+'</div>';
    const statusFlow = feature.statusFlow ? '<div class="ug-status-flow" aria-label="Alur status kunjungan">'+feature.statusFlow.map((label,index)=>(index?'<i>→</i>':'')+'<span>'+escapeHTML(label)+'</span>').join('')+'</div>' : '';
    const note = feature.note ? '<div class="ug-note"><b>Catatan</b><span>'+escapeHTML(feature.note)+'</span></div>' : '';
    return '<section class="ug-section ug-reveal'+(feature.priority?' ug-section-primary':'')+'" id="ug-'+feature.id+'" data-ug-section><div class="ug-section-heading"><div><span class="ug-kicker'+(feature.priority?' ug-kicker-primary':'')+'">'+feature.no+' · '+escapeHTML(feature.group)+'</span><h2>'+escapeHTML(feature.title)+'</h2><p>'+escapeHTML(feature.desc)+'</p></div><span class="ug-section-number">'+feature.no+'</span></div>'+(feature.priority?'<span class="ug-priority-label">FOKUS UTAMA · GUEST OPERATIONS</span>':'')+statusFlow+'<div class="ug-feature-grid">'+gallery+stepsHTML(feature.steps)+'</div>'+note+'</section>';
  };
  const toc = [{id:'overview',label:'Overview sistem',no:'00'}].concat(features.map(feature=>({id:feature.id,label:feature.title,no:feature.no})));
  const overviewHTML = overview.map(item => '<article class="ug-flow"><div class="ug-flow-mark">'+item.no+'</div><div class="ug-flow-body"><b>'+escapeHTML(item.title)+'</b><p>'+escapeHTML(item.desc)+'</p><div class="ug-flow-steps">'+item.flow.map((step,index)=>(index?'<i>→</i>':'')+'<span>'+escapeHTML(step)+'</span>').join('')+'</div></div></article>').join('');

  root.innerHTML = '<div class="ug-shell">'+
    '<header class="ug-hero ug-reveal"><div class="ug-hero-copy"><span class="ug-eyebrow">PUSAT BANTUAN · GUEST OPERATIONS</span><h1 id="ug-title">Kenali cara kerja<br><em>Guest Operational.</em></h1><p>Panduan langkah demi langkah untuk mengelola kedatangan tamu, antrean, reservasi, riwayat, dan data operasional.</p><div class="ug-hero-meta"><span><b>'+features.length+'</b> topik panduan</span><i></i><span>Mobile & desktop</span></div><a class="ug-primary-link" href="#ug-overview">Jelajahi panduan <span>↓</span></a></div><div class="ug-hero-media"><div class="ug-image-frame">'+renderVisual('dashboard.webp')+'</div><span class="ug-media-caption">Dashboard Guest · contoh data fiktif</span></div></header>'+
    '<div class="ug-intro-row ug-reveal"><p>Mulai dari Dashboard, Tambah Tamu, dan Detail Tamu. Master Barang, Resep WIP, Menu & COGS, serta Pengaturan menjadi panduan pendukung.</p><span>GULIR UNTUK MENJELAJAHI ↓</span></div>'+
    '<div class="ug-layout"><aside class="ug-toc" aria-label="Daftar isi panduan"><div class="ug-toc-label">DAFTAR PANDUAN</div><nav class="ug-toc-links">'+toc.map((item,index)=>'<a href="#ug-'+item.id+'" '+(index===0?'class="is-active"':'')+'><span>'+item.no+'</span>'+escapeHTML(item.label)+'</a>').join('')+'</nav><div class="ug-toc-note"><b>Catatan data contoh</b><p>Visual panduan merupakan ilustrasi ulang antarmuka aplikasi. Gunakan langkah tertulis sebagai acuan tindakan.</p></div></aside>'+
    '<article class="ug-article"><section class="ug-section ug-reveal" id="ug-overview" data-ug-section><div class="ug-section-heading"><div><span class="ug-kicker">00 · GAMBARAN UMUM</span><h2>Mulai dari Guest Operations</h2><p>Ikuti alur kerja utama terlebih dahulu. Bagian lain membantu menjaga data bahan, resep, dan harga menu tetap konsisten.</p></div><span class="ug-section-number">00</span></div><div class="ug-overview-list">'+overviewHTML+'</div><div class="ug-note"><b>Prioritas panduan</b><span>Dashboard Guest dan Detail Tamu mendapat penjelasan paling lengkap. Materi lain dibuat lebih ringkas sebagai panduan pendukung.</span></div></section>'+
    features.map(featureHTML).join('')+
    '<footer class="ug-ending ug-reveal"><span class="ug-eyebrow">PANDUAN NEW PROJECT</span><h2>Siap mulai operasional?</h2><p>Gunakan panduan ini sebagai referensi saat menjalankan Guest Operational. Pastikan data tamu, status kunjungan, satuan bahan, dan harga referensi sudah benar sebelum menyimpan perubahan.</p><a href="#ug-title" class="ug-back-top">Kembali ke atas ↑</a></footer></article></div></div>' +
    '<div class="ug-lightbox" id="ug-lightbox" role="dialog" aria-modal="true" aria-label="Perbesar ilustrasi panduan" hidden><div class="ug-lightbox-panel"><div class="ug-lightbox-head"><span>Ilustrasi panduan</span><button type="button" id="ug-lightbox-close" aria-label="Tutup ilustrasi">×</button></div><div class="ug-lightbox-visual"></div></div></div>';

  const tocLinks = Array.from(page.querySelectorAll('.ug-toc-links a'));
  const lightbox = page.querySelector('#ug-lightbox');
  const closeButton = page.querySelector('#ug-lightbox-close');
  const lightboxVisual = lightbox.querySelector('.ug-lightbox-visual');
  const lightboxTitle = lightbox.querySelector('.ug-lightbox-head span');
  let previousFocus = null;
  let previousOverflow = '';

  function openZoom(button) {
    previousFocus = button;
    previousOverflow = document.body.style.overflow;
    const visual = button.querySelector('.ug-visual-svg');
    lightboxVisual.innerHTML = visual ? visual.outerHTML : renderVisual(button.dataset.ugVisual);
    lightboxTitle.textContent = button.dataset.ugTitle || 'Screenshot panduan';
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    closeButton.focus();
  }

  function closeZoom() {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.style.overflow = previousOverflow;
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }

  page.addEventListener('click', event => {
    const trigger = event.target.closest('[data-ug-open-shot]');
    if (trigger && page.contains(trigger)) {
      openZoom(trigger);
      return;
    }
    if (event.target === lightbox) closeZoom();
  });

  closeButton.addEventListener('click', closeZoom);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeZoom();
  });

  tocLinks.forEach(link => {
    link.addEventListener('click', event => {
      const target = page.querySelector(link.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      tocLinks.forEach(item => item.classList.toggle('is-active', item === link));
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  window.UserGuideInitialized = true;
})();

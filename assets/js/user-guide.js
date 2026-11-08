(function () {
  const page = document.getElementById('page-user-guide');
  const root = document.getElementById('userGuideRoot');
  if (!page || !root || window.UserGuideInitialized) return;

  const slides = [
    {title:'Gambaran Umum',group:'MULAI DI SINI',desc:'Guest Operations mengelola kedatangan, antrean, reservasi, dan riwayat. Master Data menjadi dasar resep WIP dan perhitungan COGS.',steps:['Dashboard untuk melihat kondisi kunjungan.','Tambah Tamu untuk mencatat kedatangan baru.','Waiting List dan Detail Tamu untuk memproses antrean.','Reservasi untuk mengatur jadwal kedatangan.','Master Barang → Resep WIP → Menu & COGS untuk data bahan dan biaya.']},
    {title:'Dashboard Guest',group:'GUEST OPERATIONS',desc:'Mulai dari Dashboard untuk membaca kondisi operasional pada tanggal yang dipilih.',steps:['Periksa identitas workspace dan konteks outlet/divisi.','Baca total tamu, total pack, dan rata-rata waktu tunggu.','Pantau jumlah Menunggu, Selesai, dan Batal.','Periksa tamu tertunda dari hari sebelumnya.','Pilih Lihat semua untuk membuka antrean aktif.']},
    {title:'Tambah Tamu',group:'REGISTRASI TAMU',desc:'Catat kedatangan baru melalui tombol + pada Guest Operational.',steps:['Tekan + lalu pilih Tambah Tamu.','Isi nama tamu.','Atur jumlah pack menggunakan tombol minus dan plus.','Isi nomor WhatsApp bila tersedia (opsional).','Pilih Menunggu atau Langsung duduk.','Tekan Simpan tamu untuk mencatat kunjungan.']},
    {title:'Waiting List',group:'PENGELOLAAN ANTREAN',desc:'Cari tamu, pantau posisi antrean, dan lakukan tindakan dari daftar.',steps:['Pilih tanggal antrean.','Cari nama atau nomor antrean.','Gunakan filter Menunggu, Duduk, Selesai, atau Batal.','Tekan Panggil untuk membuka chat WhatsApp; periksa lalu kirim sendiri.','Tekan Duduk dan setujui konfirmasi untuk mengubah status.','Buka Detail untuk melihat informasi dan riwayat perubahan.']},
    {title:'Detail Tamu & Tindakan',group:'GUEST OPERATIONS',desc:'Periksa data tamu dan kelola perubahan status sampai kunjungan selesai.',steps:['Periksa nomor antrean/kode reservasi, tanggal, nama, pack, dan status.','Status Menunggu menampilkan Waiting Time; status Duduk menampilkan Seating Time.','Gunakan WhatsApp untuk membuka chat; pesan tetap dikirim manual.','Koreksi nama, pack, atau nomor WhatsApp dengan mengisi alasan koreksi.','Dudukkan tamu setelah membaca konfirmasi.','Tekan Selesaikan kunjungan dan setujui konfirmasi.','Periksa Riwayat perubahan untuk melihat catatan proses.'],note:'Alur umum: Menunggu → Dipanggil → Duduk → Selesai. Kunjungan selesai atau batal tidak diproses kembali melalui tindakan status biasa.'},
    {title:'Reservasi',group:'JADWAL KEDATANGAN',desc:'Atur jadwal kedatangan dan pantau reservasi melalui kalender.',steps:['Buka + lalu pilih Reservasi.','Pilih tanggal melalui kalender atau tombol Hari ini.','Tekan + Reservasi, isi nama, pack, tanggal, dan jam kedatangan.','Nomor WhatsApp dan catatan dapat diisi bila diperlukan.','Periksa kode RSV setelah tersimpan.','Buka detail reservasi untuk memproses kedatangan atau pembatalan.']},
    {title:'Riwayat',group:'CATATAN KUNJUNGAN',desc:'Tinjau catatan antrean berdasarkan tanggal pendaftaran.',steps:['Buka Riwayat dari menu +.','Pilih tanggal pendaftaran.','Cari nama tamu jika diperlukan.','Buka detail untuk memeriksa nomor antrean, pack, waktu daftar, waktu tunggu, dan status.']},
    {title:'Pengaturan',group:'PREFERENSI OPERASIONAL',desc:'Lihat informasi outlet dan atur preferensi operasional yang tersedia.',steps:['Periksa outlet aktif.','Nomor antrean diatur ulang otomatis setiap pukul 00.00 WIB.','Format nomor antrean menggunakan WL-001, WL-002, dan seterusnya.','Atur durasi Seating Time lalu tekan Simpan.','Tekan Ekspor untuk mengunduh data antrean hari ini dalam CSV.']},
    {title:'Master Barang',group:'MASTER DATA',desc:'Kelola bahan utama yang digunakan oleh resep WIP dan Menu.',steps:['Cari barang atau gunakan filter Aktif/Nonaktif.','Tambah barang dengan nama, satuan dasar, harga referensi, dan satuan harga.','Tentukan status serta kategori supply.','Tambahkan konversi jika satuan pembelian berbeda dari satuan dasar.','Periksa harga referensi karena digunakan untuk estimasi HPP.','Gunakan Download Excel, Edit, atau Nonaktifkan sesuai kebutuhan.'],note:'Perubahan satuan dan konversi dapat memengaruhi resep atau menu yang menggunakan barang tersebut.'},
    {title:'Resep WIP',group:'PRODUKSI & RESEP',desc:'Susun komposisi bahan untuk membuat hasil produksi per batch.',steps:['Cari resep atau filter Aktif/Nonaktif.','Tambah WIP dengan nama, hasil per batch, dan satuan hasil.','Pilih komponen Barang atau WIP.','Masukkan jumlah dan satuan setiap komponen.','Tinjau biaya batch dan HPP per satuan hasil.','Gunakan Download Excel, Edit, atau Nonaktifkan sesuai kebutuhan.'],note:'HPP per satuan hasil = total biaya komponen dibagi jumlah hasil per batch.'},
    {title:'Menu & COGS',group:'COST OF GOODS SOLD',desc:'Susun komposisi per porsi untuk menghitung HPP dan margin menu.',steps:['Cari menu atau gunakan filter Aktif/Nonaktif.','Tambah menu dengan nama dan harga jual per porsi.','Pilih komponen Barang atau WIP.','Masukkan jumlah dan satuan untuk setiap porsi.','Periksa harga jual, HPP per porsi, serta margin.','Gunakan Download Excel, Edit, atau Nonaktifkan sesuai kebutuhan.'],note:'HPP dan margin merupakan estimasi berdasarkan harga referensi Master Barang dan komposisi resep.'}
  ];

  const escapeHTML = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let current = 0;

  function render() {
    const slide = slides[current];
    root.innerHTML = '<div class="ug-slide-shell">' +
      '<div class="ug-slide-top"><span>PANDUAN PENGGUNA</span><span>' + (current + 1) + ' / ' + slides.length + '</span></div>' +
      '<div class="ug-slide-progress"><span style="width:' + (((current + 1) / slides.length) * 100) + '%"></span></div>' +
      '<article class="ug-slide-card"><span class="ug-slide-group">' + escapeHTML(slide.group) + '</span>' +
      '<h1>' + escapeHTML(slide.title) + '</h1><p class="ug-slide-desc">' + escapeHTML(slide.desc) + '</p>' +
      '<ol class="ug-slide-steps">' + slide.steps.map(step => '<li>' + escapeHTML(step) + '</li>').join('') + '</ol>' +
      (slide.note ? '<p class="ug-slide-note">' + escapeHTML(slide.note) + '</p>' : '') +
      '</article><div class="ug-slide-controls">' +
      '<button type="button" data-ug-prev ' + (current === 0 ? 'disabled' : '') + '>Sebelumnya</button>' +
      '<button type="button" data-ug-next>' + (current === slides.length - 1 ? 'Selesai' : 'Selanjutnya') + '</button>' +
      '</div><div class="ug-slide-dots" aria-label="Pilih slide">' +
      slides.map((item,index) => '<button type="button" data-ug-slide="' + index + '" class="' + (index === current ? 'is-active' : '') + '" aria-label="Slide ' + (index + 1) + '"></button>').join('') +
      '</div></div>';
    root.querySelector('[data-ug-prev]')?.addEventListener('click', () => { current = Math.max(0, current - 1); render(); });
    root.querySelector('[data-ug-next]')?.addEventListener('click', () => {
      if (current === slides.length - 1) current = 0;
      else current += 1;
      render();
    });
    root.querySelectorAll('[data-ug-slide]').forEach(button => button.addEventListener('click', () => {
      current = Number(button.dataset.ugSlide);
      render();
    }));
  }

  render();
  window.UserGuideInitialized = true;
})();
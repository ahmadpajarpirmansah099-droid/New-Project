# New Project — visual polish desktop and mobile

## Tujuan dan keputusan pengguna
Poles seluruh antarmuka dari login sampai halaman fitur dan popup, desktop/mobile, mengikuti referensi Finexy (komposisi), Linear (hierarki/kerapian), Untitled UI (ukuran/jarak). Tampilan saja: tanpa mengubah fungsi tombol, data, keamanan, atau alur bisnis. Motion yang ada dipertahankan dan diperhalus. Referensi adalah prinsip visual, bukan dependency atau template yang diimpor.

## Arah dan aturan visual sebelum implementasi
Enterprise Control Plane untuk operasi tamu, dengan ivory, navy, lime khas New Project dan kedalaman kartu yang terasa namun lembut. DM Sans untuk isi/kontrol; Manrope untuk judul dan angka. Font sudah tersedia. Skala 11/12/13/14/16/20/26/32; input mobile 16px. Jarak 4/8/12/16/24/32px. Radius kontrol 12px, kartu 18px, popup 24px. Shadow dibagi kontrol, kartu, fokus/hero, overlay. Lime utama #d9ee8c, lembut #eef7c7, penekanan #c5df74; fokus olive gelap. Warna status/error tidak diganti lime.

Susunan operasional tetap: ringkasan dan antrean; kalender dan daftar reservasi; tren. Sidebar rail desktop dan navigasi mobile yang ada dipertahankan. Konten/form bisa membungkus pada layar sempit. Baris KPI desktop memakai tinggi minimum 112px dan bisa tumbuh mengikuti teks/ikon yang membungkus. Tidak mengubah jumlah kartu reservasi yang ditampilkan atau scroll internalnya.

## Perilaku yang disengaja
Lapisan CSS visual terakhir mengatur hierarki teks, jarak, warna dan bayangan bersama. Animasi asli, trigger, keyframe, serta durasi yang dipakai logika JS dipertahankan; easing dekoratif tertentu diseragamkan. Hover hanya pada kontrol/kartu yang sudah interaktif; tidak menambahkan animasi masuk yang menunda akses. Reduced motion tetap dihormati.

## Batas keamanan
Tidak ada perubahan JavaScript aplikasi, handler, atribut action, ID, auth, role, RLS, RPC, migration, backend, ekspor, maupun localStorage (termasuk waitlist_frontend_demo_v1). Tidak menyembunyikan status atau kontrol. Tidak membuka data real untuk preview. Persetujuan ini tidak dianggap izin merge/deploy.

## Detail implementasi
assets/css/visual-tokens.css: konstanta visual bersama.
assets/css/visual-polish.css: styling login, navigasi, Guest Operations, kalender/form/detail, Pengaturan, Master Barang/WIP/Menu, Monitoring, Semua Divisi.
index.html: memuat kedua stylesheet setelah CSS yang sudah ada.
assets/user-guide-guest-operational.html: memakai warna/font/shadow bersama di dalam iframe tanpa mengubah tutorial atau script.

## Keterbatasan dan risiko yang perlu diuji
Browser lokal sebelumnya gagal diluncurkan; browser cloud menolak file lokal. Visual di 320/390/768/900/1440px, zoom 200%, keyboard mobile, long names, form panjang, daftar penuh/kosong, scroll internal, reduced motion, dan motion aktual perlu diverifikasi lewat preview sebelum merge. Tidak mengklaim uji fungsi produksi atau Supabase.

## Status verifikasi
- Basis main diperiksa ulang: `3a30aa0a58fb7320e4f1aa67cc99768b56d3b94e` (#222). PR lain yang masih terbuka tidak ikut digabung; termasuk #118 (hover) dan #220 (overflow desktop).
- `node --test tests/*.test.js`: 60 lulus, 0 gagal.
- `node --check`: seluruh 19 file JavaScript aplikasi lulus.
- Parser CSS dan selector: 156 aturan baru lulus; referensi token visual semuanya terdefinisi. Alat pemeriksa berada di luar repo, tidak menambah dependency aplikasi.
- Perbandingan HTML sebelum/sesudah: atribut elemen (termasuk ID, action, ARIA, form) dan script inline sama; perubahan hanya link stylesheet dan CSS panduan. Seluruh path stylesheet lokal ditemukan.
- JavaScript aplikasi tidak berubah. Tidak ada file Supabase/migration yang disentuh.
- Kontras palet: navy/lime 14.56:1, navy/lime kuat 12.47:1, muted/ivory 5.17:1, muted/putih 5.60:1, olive/lime lembut 5.54:1. Ini pemeriksaan token, bukan audit seluruh state hasil render.
- `git diff --check`: lulus. Lint heuristik CSS baru: 0/10; bukan pengganti tinjauan visual.
- Review desain berbasis kode: AI Slop 3/10 (palet 0, layout 0, komponen 1, tipografi 1, dekorasi 1), Distinctiveness 8/10 (produk 2, sistem 2, layout 2, tipografi 1, ciri khas 1). Risiko tersisa: shadow berlapis dan radius harus ditinjau dalam render sesungguhnya. Tiket antrean, jam reservasi, lime aktif, dan susunan operasional dipertahankan sebagai ciri produk.
- Uji browser/screenshot desktop-mobile dan interaksi end-to-end belum dilakukan karena keterbatasan lingkungan yang disebutkan di atas. Hasil uji unit tidak membuktikan layout/scroll/motion aktual sudah benar.
- Perubahan disiapkan sebagai draft PR; belum merge atau deploy, tanpa migration. Nomor PR dan SHA commit tersedia pada metadata PR.

## Interaksi kursor Master Data (14 November 2026)

Kartu dan tombol di Master Barang, Resep WIP dan Menu mendapat respons hover halus pada perangkat dengan kursor. Kartu informasi tidak menjadi tombol. Preferensi pengurangan gerak menghilangkan gerakan dan transisi. Perubahan hanya CSS; tidak mengubah akses, data, penyimpanan atau fungsi. Pemeriksaan visual di browser dengan data asli masih diperlukan.

## Grid Resep WIP dan Menu (14 November 2026)

Daftar kartu WIP dan Menu menjadi tiga kolom pada lebar 1.100 px ke atas, mengikuti Master Barang. Pada lebar lebih kecil aturan sebelumnya dipertahankan; status kosong memakai lebar penuh. Perubahan hanya CSS dan tidak mengubah fungsi, akses, data atau penyimpanan. Tes otomatis terkait WIP/Menu dan pemeriksaan visual browser perlu dicatat pada PR.

## Mode tampilan desktop (14 November 2026)

Tombol di Pengaturan mengubah mode terang/gelap pada layar 900 px ke atas. Preferensi hanya berlaku selama halaman terbuka dan kembali terang setelah dimuat ulang; tidak menambah atau mengubah kunci penyimpanan. Tidak ada perubahan backend, akses, autentikasi, atau data. Uji otomatis mencakup pergantian status dan label aksesibilitas. Pengujian visual seluruh halaman, dialog, grafik dan kontras dengan data asli belum dilakukan dan harus dilakukan sebelum digabung.

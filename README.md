# Guest Operations — standalone frontend

Aplikasi operasional tamu mandiri. Nama produk belum ditentukan; **Waiting List** dan **Reservasi** adalah fitur di dalam aplikasi ini.

## Fitur saat ini

- Dashboard ringkasan tamu dan antrean aktif.
- Waiting List: pendaftaran tamu, nomor antrean otomatis, perubahan status, detail, dan koreksi data.
- Reservasi: kalender bulanan, pembuatan kode reservasi, detail, pembatalan, dan proses mendudukkan tamu.
- Riwayat: pencarian berdasarkan tanggal.
- Pengaturan demo dan ekspor data antrean ke CSV.
- Navigasi melalui tombol hamburger, dengan layout responsif untuk HP dan desktop.

## Struktur file

```
index.html                 Struktur halaman dan komponen
assets/
  css/
    style.css              Warna, layout, komponen, dan animasi
  js/
    app.js                 Alur aplikasi, penyimpanan demo, dan interaksi
.github/
  workflows/
    deploy-pages.yml       Pemeriksaan JavaScript dan deployment GitHub Pages
```

## Menjalankan aplikasi

Buka `index.html` melalui browser atau gunakan alamat GitHub Pages yang terhubung ke repository ini. Tidak perlu Vite atau proses build untuk struktur saat ini.

## Penyimpanan dan batasan

- Data demo disimpan di `localStorage` browser perangkat yang digunakan.
- Data tidak tersinkron otomatis antarperangkat dan belum memakai backend/database.
- Jangan menganggap data demo sebagai data operasional permanen.
- Repository ini berdiri sendiri dan tidak terhubung dengan Barapp.

## Menjaga proyek

- Pertahankan nama kunci `localStorage` yang sudah ada agar data demo pengguna tidak hilang.
- Perubahan UI sebaiknya tidak mengubah alur penyimpanan atau status tanpa kebutuhan yang jelas.
- Workflow GitHub Pages menjalankan pemeriksaan sintaks JavaScript sebelum deployment.

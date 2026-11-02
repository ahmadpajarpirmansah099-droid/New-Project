# Guest Operations

Aplikasi mobile-first untuk mengelola kedatangan tamu, antrean, dan reservasi secara mandiri.

## Susunan fitur

- **Guest Operational** — halaman utama berisi ringkasan jumlah tamu, pack, status, dan antrean aktif.
- **Antrean** — tambah tamu, nomor antrean otomatis, panggil lewat WhatsApp, ubah status, lihat detail, dan koreksi data.
- **Riwayat** — cari catatan tamu berdasarkan tanggal.
- **Reservasi** — kalender bulanan, pembuatan kode reservasi, detail, pembatalan, dan proses mendudukkan tamu.
- **Pengaturan** — durasi Seating Time, ekspor CSV, dan reset data demo.
- **Menu cepat (+)** — akses Antrean, Riwayat, Reservasi, dan Tambah Tamu.

## Struktur file

```
index.html
  Struktur halaman dan komponen aplikasi.

assets/
  css/
    style.css
      Sistem warna, layout, komponen, responsive rules, dan animasi.
  js/
    app.js
      Navigasi, state aplikasi, penyimpanan demo, dan interaksi.

.github/
  workflows/
    deploy-pages.yml
      Pemeriksaan sintaks JavaScript dan deployment GitHub Pages.

.editorconfig
  Aturan dasar konsistensi file.
```

## Menjalankan aplikasi

Buka `index.html` melalui browser atau gunakan alamat GitHub Pages repository ini. Struktur saat ini masih berupa HTML, CSS, dan JavaScript biasa; tidak memerlukan Vite atau proses build.

## Penyimpanan dan batasan

- Data demo tersimpan di `localStorage` pada browser perangkat yang digunakan.
- Data belum tersinkron otomatis antarperangkat dan belum menggunakan backend/database.
- Pengaturan Seating Time tersimpan bersama data demo di browser yang sama.
- Ekspor tersedia dalam format CSV.
- Repository ini berdiri sendiri dan tidak terhubung dengan Barapp.

## Aturan saat mengembangkan

- Pertahankan kunci `localStorage` `waitlist_frontend_demo_v1` agar data demo yang sudah ada tetap terbaca.
- Jangan menghapus atau mengubah data pengguna maupun struktur penyimpanan tanpa persetujuan.
- Pertahankan pemisahan fitur: Guest Operational adalah halaman utama; Antrean, Riwayat, Reservasi, dan Tambah Tamu diakses dari tombol `+`.
- Semua ikon antarmuka baru harus berasal dari Lucide Icons.
- Jaga tampilan mobile sebagai prioritas dan hindari mengubah alur fitur yang tidak diminta.
- Perubahan JavaScript harus melewati pemeriksaan sintaks di GitHub Actions sebelum deployment.

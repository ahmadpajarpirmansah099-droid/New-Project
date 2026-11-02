# Guest Operations

Aplikasi mobile-first untuk mengelola kedatangan tamu, antrean, dan reservasi secara mandiri.

## Susunan fitur

- **Guest Operational** — halaman utama berisi ringkasan jumlah tamu, pack, status, dan antrean aktif.
- **Antrean** — tambah tamu, nomor antrean otomatis, panggil lewat WhatsApp, ubah status, lihat detail, dan koreksi data.
- **Riwayat** — cari catatan tamu berdasarkan tanggal.
- **Reservasi** — kalender bulanan, pembuatan kode reservasi, detail, pembatalan, dan proses mendudukkan tamu.
- **Pengaturan** — durasi Seating Time, ekspor CSV, dan reset data demo.
- **Master Barang** — sumber bahan, satuan dasar, konversi satuan, harga referensi, dan status barang.
- **Menu cepat (+)** — akses Antrean, Riwayat, Reservasi, dan Tambah Tamu.

## Struktur file

```
index.html
  Kerangka halaman dan komponen antarmuka.
  - #page-dashboard: ringkasan Guest Operational.
  - #page-waiting: daftar Waiting List.
  - #page-history: daftar dan pemilih tanggal riwayat.
  - #page-reservations: kalender dan daftar reservasi.
  - #page-settings: pengaturan operasional.
  - Bagian bawah file: menu cepat, drawer, bottom sheet, dan dialog kalender/jam.

assets/
  css/
    masterdata.css
      Tampilan mobile-first untuk modul Master Barang dengan design tokens Guest Operations.
    style.css
      Semua aturan tampilan dan animasi.
      - .page-back: tombol kembali halaman fitur.
      - .operational-filter-*: filter status detail operasional.
      - .quick-menu-*: menu cepat model kipas.
      - .reservation-day dan .reservation-list.is-changing: gerak kalender reservasi.
      - .seating-settings-* dan .seating-stepper: pengaturan Seating Time di HP.
      - #sheet .seg.is-switching: animasi pilihan status awal tamu.

  js/
    masterdata-store.js
      Penyimpanan Master Data terpisah dari data Guest Operational.
    masterdata-service.js
      Validasi Master Barang, konversi satuan, dan kalkulasi harga referensi.
    masterdata-ui.js
      Daftar, pencarian, filter, form, dan preview Master Barang.
    app.js
      Logika, penyimpanan demo, dan interaksi.
      - Bagian 1: utilitas, tanggal/jam, dan penyimpanan lokal.
      - Bagian 2: navigasi, popup, dan bottom sheet.
      - Bagian 3–4: tambah tamu, status antrean, dan tampilan daftar.
      - Bagian 5: detail operasional dari dashboard.
      - Bagian 6 (History): filter tanggal dan riwayat.
      - Bagian Reservations: kalender, formulir, dan proses duduk.
      - Bagian 7: detail tamu, koreksi, ekspor, dan reset demo.
      - Bagian 8: proses awal aplikasi dan pembaruan berkala.

.github/
  workflows/
    deploy-pages.yml
      Pemeriksaan sintaks JavaScript dan deployment GitHub Pages.

.editorconfig
  Aturan dasar konsistensi file.
```

## Master Data frontend

- Master Barang menyimpan data pada localStorage key `guestops_masterdata_demo_v1`.
- Data Master Data dipisahkan dari `waitlist_frontend_demo_v1`; data antrean, riwayat, reservasi, dan pengaturan Guest Operational tidak dipakai atau ditulis oleh modul ini.
- Struktur Master Data menyiapkan array `masterItems`, `wips`, `wipRecipeLines`, `menus`, dan `menuRecipeLines`. Pada Phase 1, yang digunakan adalah Master Barang; array WIP dan Menu masih kosong untuk fase berikutnya.
- Scope awal memakai `scope-demo-default`; model menyimpan `scope_id` agar dapat dikembangkan ke multi-outlet/divisi.
- Aplikasi belum terhubung ke Supabase atau backend. Tidak ada data produksi Barapp yang disalin.

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
- Perubahan JavaScript harus melewati pemeriksaan sintaks dan tes Master Data di GitHub Actions.
- Jangan mengganti key `guestops_masterdata_demo_v1` atau bentuk data tersimpan tanpa rencana migrasi dan persetujuan.

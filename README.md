# Guest Operations

Aplikasi mobile-first untuk mengelola kedatangan tamu, antrean, dan reservasi secara mandiri.

## Susunan fitur

- **Guest Operational** — halaman utama berisi ringkasan jumlah tamu, pack, status, dan antrean aktif.
- **Antrean** — tambah tamu, nomor antrean otomatis, panggil lewat WhatsApp, ubah status, lihat detail, dan koreksi data.
- **Riwayat** — cari catatan tamu berdasarkan tanggal.
- **Reservasi** — kalender bulanan, pembuatan kode reservasi, detail, pembatalan, dan proses mendudukkan tamu.
- **Pengaturan** — durasi Seating Time, ekspor CSV, dan reset data demo.
- **Master Barang** — sumber bahan, satuan dasar, konversi satuan, harga referensi, dan status barang.
- **Resep WIP** — komposisi bahan/WIP turunan, hasil per batch, kalkulasi HPP rekursif, dan validasi resep.
- **Menu** — komposisi bahan/WIP per porsi, HPP per porsi, harga jual, dan margin.
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
    wip.css
      Tampilan mobile-first untuk modul Resep WIP.
    menu.css
      Tampilan mobile-first untuk modul Menu dan COGS.
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
    wip-service.js
      Validasi komposisi WIP, pencegahan siklus, dan kalkulasi HPP bertingkat.
    wip-ui.js
      Daftar, pencarian, filter, form komposisi, dan ringkasan HPP WIP.
    menu-service.js
      Validasi komposisi per porsi, kalkulasi HPP Menu, dan margin.
    menu-ui.js
      Daftar, pencarian, filter, form komposisi Menu, HPP, dan margin.
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
- Struktur Master Data menggunakan array terpisah `masterItems`, `wips`, `wipRecipeLines`, `menus`, dan `menuRecipeLines`.
- Phase 1 menggunakan `masterItems` untuk Master Barang. Phase 2 menggunakan `wips` dan `wipRecipeLines` untuk Resep WIP.
- HPP WIP dihitung dari kuantitas dasar bahan dikali harga per satuan dasar. WIP turunan dihitung secara rekursif berdasarkan HPP per satuan hasilnya.
- Harga beli terakhir menjadi sumber utama; jika belum tersedia, harga referensi digunakan dan hasil HPP diberi tanda estimasi. Jika harga tidak tersedia, HPP ditandai tidak valid, bukan dianggap nol.
- Perubahan satuan Master Barang memperbarui kuantitas dasar pada resep WIP yang terkait. Perubahan satuan hasil WIP diblokir jika masih dipakai oleh resep induk dengan satuan lama.
- Phase 3 menggunakan `menus` dan `menuRecipeLines` untuk komposisi per porsi. HPP Menu menjumlahkan biaya komponen tanpa membagi ulang hasil batch WIP.
- Margin nominal dihitung dari harga jual dikurangi HPP; persentase margin dihitung terhadap harga jual. Harga jual nol membuat hasil margin tidak valid.
- Perubahan satuan hasil WIP diblokir jika satuan lama masih dipakai oleh resep WIP induk atau Menu.
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
- Perubahan JavaScript harus melewati pemeriksaan sintaks dan tes Master Barang, Resep WIP, dan Menu di GitHub Actions.
- Jangan mengganti key `guestops_masterdata_demo_v1` atau bentuk data tersimpan tanpa rencana migrasi dan persetujuan.

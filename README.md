# Guest Operations

Aplikasi mobile-first untuk mengelola kedatangan tamu, antrean, dan reservasi secara mandiri.

## Susunan fitur

- **Guest Operational** — halaman utama berisi ringkasan jumlah tamu, pack, status, dan antrean aktif.
- **Antrean** — tambah tamu, nomor antrean otomatis, panggil lewat WhatsApp, ubah status, lihat detail, dan koreksi data.
- **Riwayat** — cari catatan tamu berdasarkan tanggal.
- **Reservasi** — kalender bulanan, pembuatan kode reservasi, detail, pembatalan, dan proses mendudukkan tamu.
- **Pengaturan** — durasi Seating Time, ekspor CSV, dan reset data demo.
- **Master Barang** — sumber bahan, satuan dasar, konversi satuan, harga referensi, status aktif/nonaktif, dan penanda barang supply.
- **Resep WIP** — komposisi bahan/WIP turunan, hasil per batch, kalkulasi HPP rekursif, dan validasi resep.
- **Menu** — komposisi bahan/WIP per porsi, HPP per porsi, harga jual, dan margin.
- **Menu cepat (+)** — akses Antrean, Riwayat, Reservasi, dan Tambah Tamu.

## Struktur file

```
index.html
  Kerangka halaman, komponen antarmuka, dan urutan pemanggilan file fitur.

assets/
  css/
    style.css
      Gaya umum Guest Operations, navigasi, autentikasi, popup, dan komponen bersama.
    masterdata.css
      Tampilan Master Barang.
    wip.css
      Tampilan Resep WIP.
    menu.css
      Tampilan Menu dan COGS.
    daily-stock.css
      Tampilan Daily SO.

  js/
    auth.js
      Login, sesi, role, pemilihan outlet, dan divisi.
    app.js
      Utilitas bersama, status aplikasi, navigasi, dan kontrol popup/bottom sheet.
    guestops-queue.js
      Tambah tamu, nomor antrean, status, kartu tamu, dan tampilan dashboard Guest Operations.
    guestops-operational.js
      Detail operasional dashboard, filter status, dan grafik.
    guestops-history.js
      Filter tanggal dan daftar riwayat tamu.
    guestops-reservations.js
      Kalender, formulir, waktu reservasi, pembatalan, dan proses duduk tamu.
    guestops-detail.js
      Detail tamu, koreksi data, status tamu, WhatsApp, dan ekspor CSV.
    app-startup.js
      Inisialisasi workspace, pemuatan data, dan pembaruan berkala.
    guestops-service.js
      Komunikasi dan penyimpanan data Guest Operations ke Supabase.
    masterdata-store.js
      Penyimpanan Master Data dan pemeriksaan sesi workspace.
    masterdata-service.js / masterdata-ui.js
      Aturan dan tampilan Master Barang.
    wip-service.js / wip-ui.js
      Aturan dan tampilan Resep WIP.
    menu-service.js / menu-ui.js
      Aturan dan tampilan Menu.
    daily-stock.js
      Logika, tampilan, dan interaksi Daily SO (belum dipisah lebih lanjut).

tests/
  Pengujian otomatis untuk Guest Operations, Master Data, WIP, Menu, ekspor CSV, dan sesi workspace.

supabase/migrations/
  Riwayat perubahan database dan aturan akses.

.github/workflows/
  Pemeriksaan JavaScript, tes frontend, dan deployment GitHub Pages.
```

## Master Data frontend

- Master Barang menyimpan data pada localStorage key `guestops_masterdata_demo_v1`.
- Data Master Data dipisahkan dari `waitlist_frontend_demo_v1`; data antrean, riwayat, reservasi, dan pengaturan Guest Operational tidak dipakai atau ditulis oleh modul ini.
- Struktur Master Data menggunakan array terpisah `masterItems`, `wips`, `wipRecipeLines`, `menus`, dan `menuRecipeLines`.
- Phase 1 menggunakan `masterItems` untuk Master Barang. Phase 2 menggunakan `wips` dan `wipRecipeLines` untuk Resep WIP.
- Master Barang menyediakan penanda supply agar jenis barang dapat dibedakan tanpa membuat modul inventory tambahan.
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

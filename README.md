# New Project

Aplikasi web operasional berbasis HTML, CSS, JavaScript, dan Supabase. Tampilan diprioritaskan untuk perangkat mobile. Aplikasi mencakup Guest Operations serta modul operasional outlet seperti Master Barang, Resep WIP, Menu, dan Daily SO.

## Modul aplikasi

### Guest Operations

- **Guest Operational** — halaman utama untuk ringkasan tamu, pack, status, dan antrean aktif.
- **Antrean** — tambah tamu, nomor antrean otomatis, membuka WhatsApp untuk menghubungi tamu, mengubah status, melihat detail, dan mengoreksi data.
- **Riwayat** — mencari catatan tamu berdasarkan tanggal.
- **Reservasi** — kalender bulanan, pembuatan kode reservasi, detail reservasi, pembatalan, dan proses mendudukkan tamu.
- **Pengaturan** — pengaturan durasi Seating Time dan ekspor CSV.
- **Menu cepat (+)** — akses Antrean, Riwayat, Reservasi, dan Tambah Tamu.

### Modul operasional dan COGS

- **Master Barang** — sumber bahan, satuan dasar, konversi satuan, harga referensi, status aktif/nonaktif, dan penanda barang supply.
- **Resep WIP** — komposisi bahan/WIP turunan, hasil per batch, kalkulasi HPP rekursif, dan validasi resep.
- **Menu** — komposisi bahan/WIP per porsi, HPP per porsi, harga jual, dan margin.
- **Daily SO** — pencatatan stok dan transaksi operasional.
- **Bagian Daily SO** — Pengeluaran, Produksi WIP, Sales, Barang Masuk, dan Supplies.

## Outlet dan divisi

Data Supabase saat dokumentasi ini diperbarui memiliki 3 outlet aktif:

- Lazy Jennie
- Mannaka
- Rumah Sejoli

Setiap outlet memiliki 4 divisi aktif:

- Bar
- Kitchen
- Pastry
- Service

Daftar outlet dan divisi yang tampil di aplikasi mengikuti data aktif di Supabase. Daftar di atas merupakan kondisi database saat README ini diperbarui, bukan daftar yang ditanam permanen di aplikasi.

## Hak akses akun

Hak akses dibatasi berdasarkan peran, outlet, dan divisi yang ditugaskan.

| Jenis akun | Cakupan akses |
|---|---|
| **Developer** | Akses seluruh outlet, seluruh divisi, dan seluruh modul aplikasi, termasuk Guest Operations dan Reservasi. |
| **Admin Service** | Akses Guest Operations, Antrean, Riwayat Tamu, Reservasi, serta pengelolaan divisi Service pada outlet yang ditugaskan. Tidak memiliki akses global ke outlet lain. |
| **Admin Divisi** | Mengelola modul sesuai divisi yang ditugaskan pada outletnya. Cakupan divisi operasional Admin Divisi adalah Bar, Kitchen, dan Pastry. Tidak mendapat akses Guest Operations, Antrean, Riwayat Tamu, atau Reservasi. |

Guest Operations dan Reservasi dibatasi berdasarkan outlet/workspace, bukan berdasarkan divisi. Karena itu, Admin Service yang ditugaskan pada outlet dapat mengelola Guest Operations dan Reservasi di outlet tersebut; Admin Divisi Bar, Kitchen, dan Pastry tidak dapat mengakses fitur tersebut.

## Penyimpanan data

- Supabase menjadi sumber data operasional aplikasi.
- Data Guest Operations, riwayat perubahan status tamu, reservasi, dan pengaturan terkait disimpan melalui layanan Supabase.
- Master Barang, Resep WIP, dan Menu menggunakan `MasterDataStore` untuk membaca serta menyimpan payload ke tabel Supabase `workspace_module_state`.
- Data Master Data dipisahkan berdasarkan workspace/outlet dan divisi aktif.
- Data Guest Operations dan Reservasi dibatasi berdasarkan workspace/outlet.
- Data operasional demo di `localStorage` bukan sumber data aplikasi.
- Struktur Master Data menggunakan array terpisah `masterItems`, `wips`, `wipRecipeLines`, `menus`, dan `menuRecipeLines`.
- Master Barang menyediakan penanda supply agar jenis barang dapat dibedakan tanpa membuat modul inventory tambahan.
- HPP WIP dihitung dari kuantitas dasar bahan dikali harga per satuan dasar. WIP turunan dihitung secara rekursif berdasarkan HPP per satuan hasilnya.
- Harga beli terakhir menjadi sumber utama; jika belum tersedia, harga referensi digunakan dan hasil HPP diberi tanda estimasi. Jika harga tidak tersedia, HPP ditandai tidak valid, bukan dianggap nol.
- Perubahan satuan Master Barang memperbarui kuantitas dasar pada resep WIP yang terkait. Perubahan satuan hasil WIP diblokir jika masih dipakai oleh resep induk dengan satuan lama.
- Menu menggunakan `menus` dan `menuRecipeLines` untuk komposisi per porsi. HPP Menu menjumlahkan biaya komponen tanpa membagi ulang hasil batch WIP.
- Margin nominal dihitung dari harga jual dikurangi HPP; persentase margin dihitung terhadap harga jual. Harga jual nol membuat hasil margin tidak valid.
- Perubahan satuan hasil WIP diblokir jika satuan lama masih dipakai oleh resep WIP induk atau Menu.

## Struktur file

```
index.html
  Kerangka halaman, komponen antarmuka, dan urutan pemanggilan file fitur.

assets/
  css/
    style.css
      Fondasi tampilan Guest Operations, tata letak, dan komponen utama.
    auth.css
      Tampilan login, autentikasi, dan indikator proses logout.
    app-overrides.css
      Penyempurnaan tampilan Guest Operations, popup, reservasi, workspace, dan desktop. File ini dimuat setelah style.css dan auth.css; urutan pemuatan harus dipertahankan.
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
      Tambah tamu, nomor antrean, status, kartu tamu, dan dashboard Guest Operations.
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
    daily-stock-service.js
      Validasi sesi, pemuatan data, hitungan stok, dan transaksi Daily SO.
    daily-stock-ui.js
      Tampilan Daily SO serta halaman terpisah Pengeluaran, Produksi WIP, Sales, Barang Masuk, dan Supplies.

tests/
  Pengujian otomatis untuk Guest Operations, Master Data, WIP, Menu, Daily SO, ekspor CSV, dan sesi workspace.

supabase/migrations/
  Riwayat perubahan database dan aturan akses.

.github/workflows/
  Pemeriksaan JavaScript, tes frontend, dan deployment GitHub Pages.
```

## Menjalankan aplikasi

Buka `index.html` melalui browser atau gunakan alamat GitHub Pages repository ini. Struktur saat ini menggunakan HTML, CSS, dan JavaScript biasa; tidak memerlukan Vite atau proses build.

## Batasan dan catatan pengembangan

- Repository ini berdiri sendiri dan tidak terhubung dengan Barapp.
- Ekspor data tersedia dalam format CSV.
- Jangan menghapus atau mengubah data pengguna maupun struktur database tanpa persetujuan.
- Jangan mengubah nama kunci penyimpanan, struktur database, atau halaman yang sudah selesai tanpa persetujuan.
- Pertahankan Guest Operational sebagai halaman utama; Antrean, Riwayat, Reservasi, dan Tambah Tamu diakses melalui tombol `+`.
- Semua ikon antarmuka baru harus berasal dari Lucide Icons.
- Jaga tampilan mobile sebagai prioritas dan jangan mengubah alur fitur yang tidak diminta.
- Perubahan JavaScript harus melewati pemeriksaan sintaks dan tes Master Barang, Resep WIP, serta Menu melalui GitHub Actions.
- Jangan menaruh Supabase service key, secret key, atau kredensial pribadi di kode frontend.

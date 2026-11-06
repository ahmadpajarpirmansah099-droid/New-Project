# New Project

Aplikasi web operasional untuk pengelolaan kedatangan tamu, antrean, reservasi, dan modul operasional outlet. Antarmuka diprioritaskan untuk perangkat mobile.

## Status proyek

- Repository: private.
- Branch utama: `main`.
- Hosting: GitHub Pages melalui GitHub Actions.
- Frontend: HTML, CSS, dan JavaScript biasa; tidak memakai Vite atau proses build.
- Backend dan sumber data: Supabase.
- Repository ini berdiri sendiri dan tidak terhubung dengan Barapp.

Catatan akses: visibilitas repository yang Private tidak otomatis membuat website GitHub Pages menjadi private. Perlakukan URL website sebagai alamat yang mungkin dapat diakses publik. Akses repository dan akses website adalah dua hal berbeda.

## Modul aplikasi

### Guest Operations

- **Guest Operational** — dashboard ringkasan tamu, pack, status, dan antrean aktif.
- **Waiting List / Antrean** — tambah tamu, nomor antrean, status, detail, koreksi data, dan membuka WhatsApp untuk menghubungi tamu.
- **Riwayat** — pencarian catatan tamu berdasarkan tanggal.
- **Reservasi** — kalender, kode reservasi, detail, pembatalan, dan proses mendudukkan tamu.
- **Pengaturan** — pengaturan durasi Seating Time dan ekspor CSV.
- **Menu cepat (+)** — akses Antrean, Riwayat, Reservasi, dan Tambah Tamu.

### Master Data dan COGS

- **Master Barang** — data barang/bahan, satuan dasar, konversi satuan, harga, status aktif/nonaktif, dan klasifikasi supply.
- **Resep WIP** — komposisi bahan atau WIP turunan, hasil per batch, perhitungan HPP rekursif, dan validasi resep.
- **Menu** — komposisi bahan/WIP per porsi, HPP per porsi, harga jual, dan margin.
- **Daily SO** — pencatatan stok dan transaksi operasional, termasuk Pengeluaran, Produksi WIP, Sales, Barang Masuk, dan Supplies.

### User Monitoring

Halaman khusus Developer untuk memantau sesi perangkat dan riwayat aktivitas autentikasi.

- Tab **Live Users** dan **Activity Log**.
- Sesi dikelompokkan berdasarkan ID perangkat browser; setiap sesi login tetap tersedia pada detail perangkat.
- Heartbeat dikirim setiap 25 detik.
- Sesi dianggap offline setelah 120 detik tanpa heartbeat.
- Tampilan diperbarui otomatis setiap 30 detik saat halaman aktif/terlihat.
- Riwayat sesi disimpan selama 7 hari dan aktivitas selama 30 hari.
- Identitas perangkat mewakili instalasi browser, bukan identitas fisik perangkat.
- Detail implementasi dan batasannya: [docs/USER_MONITORING.md](docs/USER_MONITORING.md).

## Hak akses dan workspace

Akses aplikasi diverifikasi melalui sesi Supabase, profil akun, keanggotaan workspace, serta role yang ditetapkan.

| Role | Cakupan |
|---|---|
| **Developer** | Akses global lintas workspace dan dapat memilih outlet serta divisi aktif. |
| **Admin** | Mengelola data dan pengaturan di workspace yang ditugaskan. |
| **Service** | Menjalankan Guest Operations di workspace yang ditugaskan dan memiliki akses baca-saja ke Master Data. |

- Keanggotaan workspace disimpan pada `workspace_memberships`.
- Penugasan divisi disimpan pada `workspace_division_memberships`.
- Developer memiliki cakupan global; Admin dan Service tidak memperoleh akses global hanya karena role-nya.
- Otorisasi tidak boleh didasarkan pada email yang ditulis atau diperiksa secara lokal di frontend.
- Guest Operations dan data modul harus tetap dibatasi pada workspace yang telah diverifikasi.

Rujukan arsitektur: [docs/SUPABASE_WORKSPACE_ARCHITECTURE.md](docs/SUPABASE_WORKSPACE_ARCHITECTURE.md).

## Penyimpanan dan alur data

- Supabase menjadi sumber data operasional; data bisnis tidak boleh menjadikan `localStorage` sebagai sumber kebenaran.
- Guest Operations menggunakan tabel Supabase untuk tamu, riwayat status, reservasi, dan pengaturan workspace.
- Master Barang, Resep WIP, dan Menu saat ini disinkronkan melalui `MasterDataStore` ke record `workspace_module_state` dengan module key `master_data`.
- Tabel Master Data terstruktur tersedia sebagai fondasi untuk adapter terpisah di tahap berikutnya; jangan menganggap seluruh modul sudah berpindah ke tabel-tabel tersebut.
- Daily SO memiliki layanan frontend dan struktur database/migration tersendiri.
- Nomor antrean dan referensi berurutan harus dibuat melalui mekanisme database, bukan penghitung browser.

### Catatan data demo lama

Key prototype lama `waitlist_frontend_demo_v1` masih disebut di `assets/js/app.js`. Pada kondisi kode saat ini, fungsi inisialisasi menjalankan `localStorage.removeItem('waitlist_frontend_demo_v1')` untuk membersihkan data prototype lama. Ini adalah perilaku kode yang sudah ada, bukan izin untuk mengubah atau menghapus key tersebut lagi. Tinjau dan sepakati perilakunya sebelum ada perubahan lanjutan.

## Struktur file

```
index.html
  Kerangka halaman, komponen antarmuka, serta urutan pemanggilan CSS dan JavaScript.

assets/
  css/
    style.css
      Fondasi tampilan Guest Operations, tata letak, dan komponen utama.
    auth.css
      Tampilan login, autentikasi, dan indikator proses logout.
    app-overrides.css
      Penyempurnaan tampilan Guest Operations, popup, reservasi, workspace, dan desktop.
      Dimuat setelah style.css dan auth.css; urutan ini harus dipertahankan.
    masterdata.css
      Tampilan Master Barang.
    wip.css
      Tampilan Resep WIP.
    menu.css
      Tampilan Menu dan COGS.
    desktop.css
      Penyesuaian tampilan desktop.
    user-monitoring.css
      Tampilan halaman User Monitoring.
    daily-stock.css
      File stylesheet Daily SO yang tersedia di repository; saat ini tidak tercantum
      sebagai stylesheet yang dipanggil langsung oleh index.html.

  js/
    auth.js
      Login, sesi, verifikasi profil/role, workspace, dan divisi.
    app.js
      Status aplikasi, utilitas, navigasi, popup/bottom sheet, dan alur Guest Operations.
    guestops-queue.js
      Tambah tamu, nomor antrean, status, kartu tamu, dan dashboard.
    guestops-operational.js
      Detail operasional dashboard, filter status, dan grafik.
    guestops-history.js
      Filter tanggal dan daftar riwayat tamu.
    guestops-reservations.js
      Kalender, formulir, waktu reservasi, pembatalan, dan proses duduk tamu.
    guestops-detail.js
      Detail tamu, koreksi data, status, WhatsApp, dan ekspor CSV.
    guestops-service.js
      Komunikasi dan penyimpanan Guest Operations ke Supabase.
    app-startup.js
      Inisialisasi workspace, pemuatan data, dan pembaruan berkala.
    user-monitoring.js
      Pendaftaran sesi, heartbeat, Presence, dan tampilan monitoring.
    masterdata-store.js
      Penyimpanan Master Data dan pemeriksaan sesi workspace.
    masterdata-service.js / masterdata-ui.js
      Aturan dan tampilan Master Barang.
    wip-service.js / wip-ui.js
      Aturan dan tampilan Resep WIP.
    menu-service.js / menu-ui.js
      Aturan dan tampilan Menu.
    daily-stock-service.js / daily-stock-ui.js
      Layanan data, validasi, hitungan stok, dan tampilan Daily SO.

docs/
  SUPABASE_WORKSPACE_ARCHITECTURE.md
    Batas workspace, role, penyimpanan modul, dan aturan untuk modul baru.
  USER_MONITORING.md
    Rincian implementasi, keamanan, dan verifikasi User Monitoring.

supabase/
  functions/
    auth-login/
      Edge Function untuk alur login dan pencatatan aktivitas autentikasi.
  migrations/
    Riwayat file SQL perubahan database yang tersedia di repository.
    README.md menjelaskan keterbatasan kelengkapan sumber migration.

tests/
  Pengujian otomatis Guest Operations, akses workspace, Master Data, WIP,
  Menu, Daily SO, ekspor CSV, dan sesi workspace.

.github/workflows/
  Pemeriksaan sintaks JavaScript, tes frontend, dan deployment GitHub Pages.
```

## Menjalankan dan menerbitkan aplikasi

- Untuk pengembangan sederhana, buka `index.html` melalui server lokal atau gunakan URL GitHub Pages.
- Tidak diperlukan Vite atau proses build untuk struktur saat ini.
- Push ke `main` menjalankan workflow GitHub Actions: pemeriksaan sintaks JavaScript, tes frontend, lalu deployment GitHub Pages jika pemeriksaan lulus.
- Perubahan pada pull request menjalankan validasi; deployment dilakukan dari push ke `main` atau workflow manual pada `main`.
- Keberhasilan workflow adalah bukti proses validasi/deploy pada run tersebut, bukan pengganti pemeriksaan tampilan langsung di browser.

## Database dan migration

Folder `supabase/migrations/` berisi file migration yang tersedia di repository, tetapi belum boleh dianggap sebagai riwayat rebuild database yang lengkap. Baca [supabase/migrations/README.md](supabase/migrations/README.md) sebelum menjalankan reset, bootstrap database baru, atau pekerjaan migration. Database live tetap menjadi sumber kebenaran sampai gap sumber migration diselesaikan.

## Aturan pengembangan

- Pertahankan pendekatan mobile-first.
- Semua ikon antarmuka baru harus menggunakan Lucide Icons.
- Jangan mengubah alur atau fitur yang tidak termasuk ruang lingkup pekerjaan.
- Jangan mengubah nama key penyimpanan, menghapus data tamu/riwayat, atau mengubah struktur database tanpa persetujuan.
- Jangan mengubah RLS, RPC, autentikasi, hak akses, atau migration tanpa persetujuan.
- Jangan menaruh Supabase service-role key, password, atau kredensial privat di frontend. Publishable key boleh digunakan sesuai fungsi publiknya.
- Perubahan JavaScript harus melewati pemeriksaan sintaks dan rangkaian tes melalui GitHub Actions.
- Pertahankan urutan stylesheet yang ditulis di `index.html`.

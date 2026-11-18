# New-Project

Aplikasi operasional berbasis web untuk mengelola kedatangan tamu, antrean, riwayat kunjungan, reservasi, master data, menu, WIP, dan persediaan. Antarmuka mendukung ponsel dan desktop.

## Fitur utama

- **Guest Operational:** dashboard, antrean, detail tamu, riwayat, reservasi, dan pengaturan operasional.
- **Master Data:** master barang, resep WIP, menu, serta ekspor data.
- **Stock Opname:** pencatatan stok, penyesuaian, dan ringkasan persediaan sesuai akses divisi.
- **User Monitoring:** pemantauan sesi dan aktivitas akun untuk Developer.
- **Panduan Pengguna:** panduan penggunaan yang tersedia dari dalam aplikasi.

## Teknologi

- HTML, CSS, dan JavaScript tanpa proses bundling atau build.
- Supabase untuk autentikasi dan penyimpanan data.
- Supabase Edge Functions untuk proses yang membutuhkan kredensial server.
- GitHub Pages untuk hosting frontend dan GitHub Actions untuk pemeriksaan serta deployment.

## Menjalankan secara lokal

Dari direktori utama proyek, jalankan server HTTP lokal:

```sh
python3 -m http.server 8000
```

Buka alamat http://localhost:8000 di browser. Aplikasi menampilkan halaman masuk; fitur workspace membutuhkan akun dan izin yang sesuai.

## Menjalankan pemeriksaan

Node.js dibutuhkan untuk menjalankan pemeriksaan JavaScript dan tes frontend. Tidak ada instalasi dependency proyek yang diperlukan.

```sh
# Periksa sintaks semua modul JavaScript frontend
find assets/js -type f -name '*.js' -print0 | xargs -0 -r -n1 node --check

# Jalankan seluruh tes frontend
node --test tests/*.test.js
```

GitHub Actions menjalankan kedua pemeriksaan tersebut pada pull request dan push ke branch `main`. Deployment GitHub Pages hanya berjalan setelah validasi berhasil pada push ke `main` atau pemicu manual.

## Struktur proyek

```text
index.html                 Halaman aplikasi dan markup utama
assets/css/                Gaya aplikasi, tema, dan komponen
assets/js/auth.js          Autentikasi dan pemilihan workspace
assets/js/guestops-*.js    Layanan, antrean, operasional, riwayat, reservasi, detail
assets/js/masterdata-*.js  Penyimpanan, layanan, dan UI master data
assets/js/menu-*.js        Layanan dan UI menu
assets/js/wip-*.js         Layanan dan UI WIP
assets/js/stock-*.js       Stock Opname, ekspor, dan dashboard stok
assets/js/app.js           Navigasi dan fungsi bersama aplikasi
assets/js/app-startup.js   Inisialisasi workspace dan siklus sesi
assets/images/             Gambar dan ilustrasi
assets/vendor/             Library vendor yang disimpan bersama aplikasi
supabase/functions/        Edge Functions; dijalankan di sisi server
supabase/migrations/       Riwayat perubahan skema database
docs/                      Dokumentasi teknis dan keputusan fitur
tests/                     Tes regresi frontend dan SQL
.github/workflows/         Validasi dan deployment GitHub Pages
```

## Catatan keamanan

- Frontend hanya boleh memakai Supabase URL dan **publishable key** (`sb_publishable_...`). Publishable key memang dapat dilihat di browser; keamanan data tetap harus ditegakkan melalui autentikasi, RLS, dan izin database.
- Jangan pernah menaruh Supabase secret key (`sb_secret_...`), service-role key, kata sandi, token privat, atau kredensial database di `index.html`, `assets/`, maupun file lain yang dikirim ke browser.
- Kredensial istimewa harus disimpan sebagai environment secret dan hanya dibaca oleh kode server, misalnya Supabase Edge Functions melalui `Deno.env.get(...)`.
- Tes `tests/frontend-security.test.js` memeriksa pola kredensial istimewa umum pada HTML utama dan modul JavaScript frontend. Pemeriksaan ini merupakan pagar regresi, bukan pengganti audit keamanan menyeluruh.
- Jangan memasukkan token, kata sandi, kredensial, URL yang memuat kredensial, atau data pengguna ke README, log, maupun commit publik.

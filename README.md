# New-Project

Aplikasi web operasional untuk mengelola tamu, antrean, reservasi, menu, dan persediaan. Antarmukanya tersedia untuk layar desktop dan ponsel.

## Fitur utama

- **Guest Operational:** ringkasan operasional, antrean aktif, riwayat tamu, dan reservasi.
- **Master Data:** pengelolaan barang, resep WIP, dan menu.
- **Stock Opname:** pencatatan persediaan dan pencocokan stok fisik.
- **Panduan Pengguna:** petunjuk penggunaan yang tersedia di dalam aplikasi.

## Menjalankan secara lokal

Proyek ini menggunakan HTML, CSS, dan JavaScript tanpa proses build. Dari direktori utama proyek, jalankan server HTTP lokal:

```sh
python3 -m http.server 8000
```

Buka `http://localhost:8000` di browser. Halaman aplikasi memiliki proses masuk; fitur yang memerlukan data workspace membutuhkan akun dan akses layanan yang sesuai.

## Struktur proyek

```text
index.html  Halaman utama aplikasi
assets/     CSS, JavaScript, dan aset tampilan
docs/       Dokumentasi proyek
supabase/   Komponen layanan data
tests/      Berkas pengujian
```

## Catatan keamanan

Jangan menaruh token, kata sandi, kredensial, URL yang memuat kredensial, atau data pengguna di README maupun commit publik.

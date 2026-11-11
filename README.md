# New-Project

Aplikasi web operasional untuk mendukung pengelolaan tamu, reservasi, data menu, dan persediaan. Bisa dibuka lewat HP maupun desktop.

## Fitur

- **Guest Operational** untuk melihat ringkasan operasional, antrean tamu, dan reservasi.
- **Master Data** untuk mengelola barang, Resep WIP, dan menu.
- **Stock Opname** untuk mencatat persediaan dan mencocokkan stok fisik.
- **Panduan Pengguna** tersedia di dalam aplikasi.

## Pengembangan lokal

Aplikasi menggunakan HTML, CSS, dan JavaScript, serta dapat dijalankan tanpa proses build.

```sh
python3 -m http.server 8000
```

Lalu buka http://localhost:8000 di browser.

## Struktur folder

```text
assets/    Tampilan, kode aplikasi, dan gambar
docs/      Dokumentasi proyek
supabase/  Komponen layanan data
tests/     Berkas pengujian
```

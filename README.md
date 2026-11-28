# New-Project

Aplikasi operasional berbasis web untuk kedatangan tamu, antrean, reservasi, master data, menu, WIP, dan persediaan; mendukung ponsel dan desktop.

## Fitur utama

- Guest Operational: antrean, detail tamu, riwayat kunjungan, dan reservasi.
- Master Data, menu, resep WIP, User Monitoring, dan panduan pengguna.
- Stock Opname dan ringkasan persediaan sesuai akses divisi.

## Teknologi

HTML, CSS, JavaScript tanpa build; Supabase untuk autentikasi dan data, Edge Functions untuk proses server, serta GitHub Pages dan Actions untuk frontend.

## Menjalankan secara lokal

```sh
python3 -m http.server 8000
```

Buka http://localhost:8000; fitur workspace membutuhkan akun dan izin yang sesuai.

## Tes frontend

Perlu Node.js; tidak perlu instalasi dependency proyek. Jalankan dari shell yang mendukung `find` dan `xargs`:

```sh
find assets/js -type f -name '*.js' -print0 | xargs -0 -r -n1 node --check
node --test tests/*.test.js
```

## Sebelum publikasi

- Gunakan data sintetis dalam dokumentasi dan tangkapan layar; jangan unggah identitas, aktivitas pengguna, atau angka operasional nyata.
- Simpan kredensial istimewa sebagai secret di sisi server, bukan di frontend, repo, atau log; akses browser tetap dibatasi autentikasi dan izin database.
- Sebelum commit/deploy, tinjau teks, gambar, aset biner, dan data yang tertanam dalam HTML. Pages menyalin seluruh `assets/`; pastikan semua materi yang terpublikasi aman.
- Jika data atau kredensial terlanjur terbuka, hentikan publikasi lanjutan, rotasi kredensial terkait, ganti materi, dan koordinasikan pembersihan riwayat repo serta cache.

Panduan ini bukan jaminan bahwa isi repo atau situs yang sudah terbit aman; tetap perlu peninjauan tersendiri.

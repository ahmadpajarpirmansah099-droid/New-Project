# Rincian hasil opname ringkas — 11 November 2026

## Perilaku yang disengaja

- Setiap barang tampil sebagai dua baris ringkasan: nama dan selisih rupiah, lalu stok sistem ke fisik dan selisih unit.
- Ketuk ringkasan barang untuk membuka Stock Awal, pergerakan per kategori, harga, dan rincian selisih lengkap.
- Urutan dan angka hasil opname tetap mengikuti data tersimpan.

## Batas keamanan dan implementasi

- Hanya tampilan riwayat di `assets/js/stock-opname-ui.js` dan `assets/css/stock-opname.css` yang berubah. Tes ringkasan ada di `tests/stock-opname-ui.test.js`.
- Tidak ada perubahan database, RLS, RPC, autentikasi, hak akses, penyimpanan, atau alur perhitungan. Pembatasan admin divisi tetap melalui layanan yang ada.

## Keterbatasan, risiko, dan verifikasi

- Tes komponen 14 lulus, sintaks JavaScript dan `git diff --check` lulus.
- Pemeriksaan visual Chromium lokal terhalang pembatasan socket lingkungan; tampilan Android asli dan akun Bar belum diuji.
- Perubahan masih di working tree lokal, belum menjadi PR, belum digabung, dan belum terpasang di GitHub Pages.

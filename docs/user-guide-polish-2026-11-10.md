# Polesan Panduan Guest Operational

## Perilaku yang disengaja
User meminta halaman panduan dipoles mengikuti referensi Slack Quick Start dan Linear Start Guide. Enam bab dan screenshot yang ada dipertahankan. Daftar langkah tersedia lewat menu sticky yang menutup setelah bab dipilih atau Escape. Kartu bab membantu pencarian ulang; screenshot tutorial dibuat stabil agar sorotan mudah dibaca. Marquee dekoratif digantikan navigasi berguna. Warna ivory/lime/navy dipertahankan.

## Batas keamanan
Tidak mengubah hak akses, autentikasi, Supabase, database, RLS, RPC, data operasional, maupun localStorage. Halaman tetap konten statis di iframe yang sama. Tidak ada dependency baru.

## Detail implementasi
assets/user-guide-guest-operational.html: gaya responsif, menu details/summary, penutupan menu, teks pembuka dan tampilan bab. Animasi hero dan zoom gambar tetap tersedia.

## Keterbatasan yang diketahui
Belum diverifikasi visual di browser: browser pengujian gagal diluncurkan karena lingkungan menolak socket. Pengujian di iframe aplikasi asli dan HP pengguna masih diperlukan.

## Risiko yang masih perlu diuji
Posisi sticky, keterbacaan pada 320px, menu bab, zoom/Escape, dan preferensi reduced motion pada perangkat asli.

## Status verifikasi
git diff --check, validasi sintaks JavaScript inline, dan keberadaan keenam target bab lulus. Tes browser belum berjalan. Disiapkan sebagai draft PR; belum merge/deploy. Tidak ada migration.

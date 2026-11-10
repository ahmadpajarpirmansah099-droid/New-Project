# New Project

Aplikasi web operasional untuk membantu pengelolaan kedatangan tamu, antrean, reservasi, serta data master outlet. Antarmuka dikembangkan dengan pendekatan mobile-first.

## Fitur

### Guest Operations
- Dashboard ringkasan tamu dan antrean aktif.
- Waiting List untuk mencatat tamu dan mengelola antrean.
- Riwayat kedatangan tamu.
- Reservasi, kalender, dan pengelolaan status kedatangan.
- Pengaturan operasional dan ekspor data.

### Master Data
- Master Barang untuk mengelola data bahan/barang.
- Resep WIP untuk menyusun komposisi dan hasil produksi.
- Menu untuk mengelola komposisi menu dan informasi biaya.

### Stock Opname (tahap 1)
- Stock Awal, Pengeluaran, Barang Masuk, Produksi WIP, dan Sales massal.
- Opname dengan selisih unit/rupiah dan konfirmasi Stock Awal periode berikutnya.
- Form HP satu bahan per baris; draft dapat dipulihkan dari perangkat.
- Aktivasi per outlet/divisi oleh Developer; awalnya Lazy Jennie – Bar.
- Impor dan ekspor Excel dijadwalkan pada tahap 2.
- PRD dan urutan aktivasi tersedia di `docs/stock-opname/`.

### Monitoring
- User Monitoring untuk pengguna dengan hak akses yang sesuai.
- Ringkasan data lintas divisi untuk Developer sesuai ruang aksesnya.

## Teknologi

- Frontend: HTML, CSS, dan JavaScript.
- Backend dan penyimpanan data: Supabase.
- Hosting: GitHub Pages melalui GitHub Actions.
- Ikon antarmuka: Lucide Icons.

Repository ini menggunakan struktur frontend tanpa proses build khusus. Vite tidak diperlukan untuk menjalankan struktur aplikasi saat ini.

## Hak akses

Aplikasi menggunakan sistem autentikasi dan pembatasan akses berdasarkan peran serta ruang kerja. Pengguna hanya boleh mengakses fitur dan data sesuai izin yang diberikan.

Rincian konfigurasi internal, struktur database, dan mekanisme keamanan tidak dicantumkan dalam dokumentasi publik.

## Struktur proyek

```
index.html
assets/
  css/       Stylesheet aplikasi
  js/        Logika antarmuka dan integrasi layanan
docs/        Dokumentasi pengembangan
supabase/    Kode fungsi dan file perubahan database
tests/       Pengujian otomatis
.github/
  workflows/ Otomatisasi pemeriksaan dan deployment
```

## Menjalankan proyek

1. Clone repository.
2. Buka folder proyek melalui editor atau server lokal.
3. Jalankan aplikasi melalui server lokal agar pemuatan file dan modul berjalan sesuai kebutuhan.
4. Siapkan konfigurasi layanan yang diperlukan melalui cara yang aman sebelum menguji fitur yang terhubung ke backend.

Jangan memasukkan password, private key, service-role key, token, atau kredensial pribadi ke dalam file frontend maupun dokumentasi.

## Deployment

Perubahan pada branch utama akan menjalankan workflow GitHub Actions untuk pemeriksaan kode dan proses deployment GitHub Pages sesuai konfigurasi repository.

Status workflow yang berhasil tidak menggantikan pemeriksaan aplikasi secara langsung melalui browser.

## Pedoman kontribusi

- Pertahankan pendekatan mobile-first dan perilaku fitur yang sudah ada.
- Gunakan Lucide Icons untuk ikon antarmuka baru.
- Hindari mengubah alur aplikasi di luar ruang lingkup pekerjaan.
- Jangan mengubah autentikasi, hak akses, konfigurasi backend, atau struktur database tanpa persetujuan pemilik proyek.
- Jangan menghapus atau mengubah data pengguna tanpa persetujuan.
- Simpan konfigurasi rahasia di tempat penyimpanan rahasia yang sesuai; jangan commit file rahasia ke repository.
- Jalankan pemeriksaan dan pengujian yang relevan sebelum mengajukan perubahan.

# New-Project

Aplikasi web operasional outlet untuk mengelola kedatangan tamu, data master, dan stok. Antarmuka dirancang untuk HP dan desktop.

## Guest Operational

- Dashboard menampilkan ringkasan tamu, antrean aktif, dan reservasi. Tampilan desktop juga menampilkan kalender reservasi dan grafik bulanan.
- Gunakan menu cepat `+` untuk Tambah Tamu, Waiting List, Riwayat, dan Reservasi. Data antrean hari ini dapat diekspor sebagai CSV.
- Pengaturan memuat preferensi operasional. Panduan Pengguna dapat dibuka dari menu aplikasi.

## Tampilan dan navigasi

- Pada desktop lebar (1280 px ke atas), area kerja menggunakan layout tanpa header atas dan navigasi kiri tetap tersedia.
- Dropdown Outlet dan Divisi hanya ditampilkan di Dashboard agar tidak menutupi judul atau kontrol di halaman fitur lain.
- Tampilan mobile tetap mengikuti layout responsif aplikasi.


## Master Data

- **Master Barang** menyimpan bahan, satuan, konversi, dan harga.
- **Resep WIP** mengatur komposisi, hasil per batch, dan biaya produksi.
- **Menu** mengatur komposisi menu dan HPP. Ketiga halaman memiliki tombol unduh Excel masing-masing.

## Stock Opname

1. Isi **Stock Awal** pertama untuk semua barang dan WIP, termasuk angka 0.
2. Catat **Barang Masuk**, **Pengeluaran**, **Produksi WIP**, dan **Sales** selama periode berjalan. Di Barang Masuk, cari nama barang dan pilih satu per satu. Beberapa barang bisa disimpan dalam satu transaksi. Sales menerima jumlah menu terjual untuk satu rentang tanggal.
3. Isi **Stock Opname** untuk mencocokkan stok fisik dengan stok sistem. Rincian hasil menampilkan pergerakan stok, selisih per barang, dan total selisih rupiah.
4. Konfirmasi hasil fisik sebagai **Stock Awal** periode berikutnya. Jika opname ditutup tanggal 8 November, periode berikutnya mulai tanggal 9 November. Saat konfirmasi tertunda, transaksi baru dapat disimpan sebagai draft dan dikirim setelah Stock Awal dikonfirmasi.

Riwayat tersedia per fitur dan dikelompokkan per tanggal. Barang Masuk menampilkan total per bahan. Pengeluaran menampilkan total per bahan dan kategori. Ringkasan kedua fitur mencakup seluruh transaksi aktif pada tanggal tersebut, sementara catatan asli tetap dapat dibuka. Sales menampilkan menu dan jumlah terjual serta rincian pemakaian bahan jika catatan transaksi menyediakannya.

Form hitung fisik menampilkan satu bahan per baris di HP. Draft form tersimpan pada perangkat yang sama. Developer mengatur aktivasi per outlet dan divisi, sementara admin divisi yang ditugaskan mengerjakan transaksi. Impor dan ekspor Excel Stock Opname direncanakan untuk tahap 2. [Dokumentasi Stock Opname](docs/stock-opname/implementation.md)

## Akses dan monitoring

Akses fitur dan data mengikuti peran, outlet, dan divisi yang dipilih. Developer memiliki tampilan User Monitoring dan ringkasan Semua Divisi sesuai izin akun.

## Pengembangan

Frontend menggunakan HTML, CSS, JavaScript, dan Lucide Icons. Supabase menangani autentikasi dan penyimpanan data. Aplikasi dapat dijalankan tanpa build atau Vite.

Dari direktori repo, jalankan server lokal lalu buka [http://localhost:8000](http://localhost:8000).

```sh
python3 -m http.server 8000
```

Jalankan pemeriksaan otomatis dengan Node.js.

```sh
node --test tests/*.test.js
```

Fitur yang terhubung ke backend memerlukan akun berizin di lingkungan yang sesuai.

## Rahasia dan akses

- Browser menggunakan URL proyek Supabase dan `SUPABASE_PUBLISHABLE_KEY` untuk koneksi. Publishable key memang ditujukan untuk aplikasi klien dan bukan kunci rahasia.
- Jangan menaruh nilai `service_role`, kata sandi database, token privat, atau kredensial operator di HTML, CSS, JavaScript, README, atau commit Git.
- Edge Function `auth-login` membaca kredensial privat dari environment Supabase Functions. Simpan nilainya di pengaturan secrets Supabase, bukan di source code.
- Hak akses harus ditegakkan oleh backend dan kebijakan RLS; menyembunyikan tombol atau halaman di frontend bukan batas keamanan.

| Lokasi | Isi |
| --- | --- |
| `index.html` | Halaman utama dan pemuatan aset |
| `assets/css/` | Gaya tampilan dan aturan responsif |
| `assets/js/` | Antarmuka dan integrasi layanan |
| `docs/` | Dokumentasi pengembangan dan Stock Opname |
| `supabase/` | Fungsi dan catatan migrasi Supabase |
| `tests/` | Pengujian JavaScript dan skenario SQL |
| `.github/workflows/` | Validasi dan penerapan GitHub Pages |

## Deployment

Pull request ke `main` menjalankan validasi. Push ke `main` menjalankan validasi lalu deployment ke GitHub Pages. Periksa workflow dan halaman live untuk memastikan versi terbaru sudah tersedia. [Workflow deployment](.github/workflows/deploy-pages.yml)

## Kontribusi

Pertahankan perilaku fitur dan desain mobile-first. Gunakan Lucide untuk ikon baru. Perubahan autentikasi, hak akses, struktur database, dan data pengguna memerlukan persetujuan pemilik proyek.

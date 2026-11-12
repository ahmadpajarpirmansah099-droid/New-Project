# Dashboard Stock Opname

## Perilaku yang disengaja

Keputusan produk mengikuti PRD Final Dashboard Stock Opname dan klarifikasi pengguna pada 12 November 2026.

- Halaman dashboard terpisah dapat dibuka melalui tombol Dashboard pada Stock Opname atau menu cepat Stock Opname.
- Enam kartu membuka popup. Sales lebih menonjol dan lebih lebar pada desktop. Rincian Barang Masuk dan kategori Pengeluaran menggunakan popup yang sama dengan tombol Kembali.
- Periode awal memakai bulan kalender berjalan dalam waktu Jakarta. Kalender memilih satu tanggal atau rentang dalam satu bulan kalender. Perpindahan bulan mereset rentang pilihan ke bulan yang dituju.
- Sales memakai data yang tersedia. Catatan gabungan masuk pada tanggal akhir catatan. Rentang aslinya terlihat dalam rincian. Harga/HPP yang tidak tersedia diberi keterangan, dengan tanda kosong ketika semua angka untuk komponen itu tidak tersedia.
- Pengeluaran, Pengeluaran Suplies, dan Selisih semua barang memakai cakupan masing-masing. Selisih Suplies mempertahankan tanda asli, termasuk +Rp20.000. Grafik Total Pengeluaran menjumlahkan nilai modul Pengeluaran dan nilai selisih Suplies sesuai tandanya.
- Selisih semua barang selalu memakai satu bulan kalender penuh. Stok sistem dihitung dari stok awal bulan dan transaksi pada bulan tersebut, termasuk seluruh periode opname yang ada dalam bulan itu. Selisih opname antara tidak mengganti patokan stok awal bulan untuk perbandingan bulanan.
- Sebelum opname akhir bulan tersedia, popup menampilkan stok sistem sementara dan kartu menampilkan tanda kosong. Setelah opname berstatus closed tepat pada tanggal terakhir bulan, sistem membandingkan dengan stok fisik dan harga/biaya snapshot opname tersebut.
- Suplies dikecualikan dari selisih bulanan bahan dan WIP. Barang Masuk bernilai nol disembunyikan dari popup. Pengeluaran menggabungkan tanggal, barang, dan kategori yang sama.
- Dokumen void dan transaksi pada periode held dikecualikan. Penyesuaian Move mengimbangi nilai Pengeluaran asal sesuai tanggal penyesuaian.

## Batas keamanan

- RPC `stock_opname_dashboard_read` memakai pembungkus SECURITY INVOKER. Helper `private.so_dashboard_view` memeriksa identitas, divisi aktif, aktivasi Stock Opname, serta peran Developer atau otorisasi admin divisi melalui `private.so_allowed`.
- Developer global memperoleh hak baca dashboard pada divisi Stock Opname yang aktif. Akses operasi pencatatan tetap diperiksa oleh fungsi operasi yang sudah ada.
- PUBLIC dan anon tidak mendapat izin eksekusi pada kedua fungsi baru. Pengguna service serta admin tanpa keanggotaan divisi ditolak.
- Pergantian akun/divisi membatalkan hasil permintaan lama, mengosongkan dashboard, dan menutup popup. Nama barang dan data tampil melalui escaping HTML.

## Detail implementasi

- `assets/js/stock-dashboard-model.js` menghitung agregat kartu, grafik, rincian, dan stok bulanan dari snapshot.
- `assets/js/stock-dashboard-ui.js` menangani halaman, popup, kalender, status pemuatan/gagal/kosong, dan grafik canvas dengan rincian keyboard/pointer.
- `assets/css/stock-dashboard.css` memakai token warna, font, jarak, radius, dan shadow aplikasi. Arah visual berupa dashboard operasional padat dengan angka tabular, kartu Sales lime, dan grafik di bawah kartu. Ikon tambahan menggunakan path Lucide Calendar dan ChartColumnIncreasing pada navigasi.
- `assets/js/stock-opname-service.js` menyediakan pembacaan dashboard khusus. Navigasi ditautkan melalui `stock-opname-ui.js`, `app.js`, `app-startup.js`, dan `index.html`.
- Migrasi `20261112121804_stock_opname_dashboard_read_v1.sql` menambahkan pembacaan tersebut serta `is_supply` pada hasil `private.so_item`. Field itu mengikuti snapshot baru untuk posting dan hasil opname. Dokumen dan periode lama tidak ditulis ulang.
- Respons dashboard membuang salinan katalog penuh pada transaksi. Sales mempertahankan menu dan urutan resep tersimpan untuk perhitungan historis.
- `.github/workflows/deploy-pages.yml` menjalankan pemeriksaan sintaks dan tes model baru.
- Tanggal transaksi pada tes regresi SQL lama disesuaikan ke awal periode setelah aktivasi. Tes lama mengalami kegagalan yang sama sebelum migrasi dashboard karena memakai tanggal periode sebelumnya.

## Keterbatasan yang diketahui

- Sales gabungan tidak menyediakan rincian tanggal penjualan sebenarnya. Grafik memakai tanggal akhir catatan sesuai keputusan pengguna.
- Klasifikasi Suplies lama menggunakan penanda snapshot bila tersedia, kemudian referensi asal impor, kemudian Master Barang saat ini. Catatan lama tanpa kedua penanda historis dapat mengikuti perubahan status master.
- Bulan yang stok awalnya baru dimulai di tengah bulan diberi tanggal awal data yang tersedia. Bulan tanpa stok awal yang bisa digunakan menampilkan pesan belum tersedia.
- Perhitungan penutupan bulanan diuji menggunakan fixture karena data operasional saat implementasi belum mencakup opname akhir bulan.
- Backend masih mengirim riwayat untuk divisi terpilih. Pemilihan periode dan agregasi dikerjakan di browser.

## Risiko yang diuji

- Penghitungan ulang transaksi, salah bulan, stok awal setelah opname antara, item historis yang dinonaktifkan, item master yang ditambahkan setelah penutupan, salah tanda Suplies, pembalikan Move, serta data lama yang kurang lengkap.
- Pembacaan lintas divisi, identitas kosong, akun service, divisi nonaktif, dan respons lama setelah sesi berubah.

## Status verifikasi

- 115 tes JavaScript lulus. Pemeriksaan sintaks dan `git diff --check` lulus.
- Tes database dashboard, operasi Stock Opname, dan regresi transaksi lulus dalam transaksi yang di-ROLLBACK. Fixture tidak tersimpan.
- Hitungan dashboard dicocokkan dengan 215 transaksi operasional. Total kartu dan grafik cocok dengan sumber tersimpan, dengan toleransi pembulatan Rp1. Terdapat 96 item bahan/WIP dan 9 item Suplies.
- Browser preview dengan data contoh memverifikasi navigasi dari halaman Stock Opname dan menu cepat tombol +, enam popup, rincian bertingkat, kalender satu bulan, kondisi kosong, error dan Coba lagi, serta popup pada viewport iframe 390px. Lebar dokumen mobile 375px sesuai lebar konten, tanpa overflow horizontal.
- Pemeriksaan visual mengikuti token proyek. Penilaian internal anti-slop 1/10 dan distinctiveness 8/10. Uji UI memakai data contoh dan backend diuji terpisah melalui RPC serta SQL.
- Migrasi sudah diterapkan ke Supabase pada 12 November 2026. RPC setelah penerapan mengembalikan data divisi yang sesuai dan 9 item bertanda Suplies.
- Status commit, PR, CI, merge, dan GitHub Pages dicatat pada PR. Dashboard frontend tersedia di produksi setelah PR digabung dan deployment GitHub Pages berhasil.

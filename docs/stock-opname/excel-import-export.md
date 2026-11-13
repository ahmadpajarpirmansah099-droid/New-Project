# Ekspor dan impor Excel Stock Opname dan Sales

## Perilaku yang disengaja

- Admin divisi dapat mengekspor template/isian form untuk tanggal opname atau rentang Sales. Riwayat menyediakan ekspor hasil satu opname atau satu catatan Sales pada tanggal/rentang yang tercatat; tidak menggabungkan beberapa transaksi Sales otomatis.
- Impor menerima template aplikasi dalam format `.xlsx` untuk jenis, divisi, tanggal dan (untuk opname) periode yang sesuai. Data dimasukkan sebagai draft perangkat; draft yang sudah berisi memerlukan persetujuan sebelum diganti. Penyelesaian tetap menggunakan konfirmasi dan validasi server yang sudah ada.
- Hasil opname berisi stok sistem, fisik, selisih dan harga. Saat impor, hanya jumlah fisik dan satuan dipakai; data hasil perhitungan tidak mengubah stok secara langsung.

## Batas keamanan dan implementasi

- Tidak ada perubahan database, RLS, RPC, autentikasi, hak akses atau nama kunci penyimpanan. Hak akses dan pemeriksaan periode tetap mengikuti alur Stock Opname yang ada.
- File dibaca di browser menggunakan SheetJS 0.20.3 yang dimuat saat diperlukan. File dibatasi 2 MB; identitas item, satuan, angka, duplikasi, rumus, jenis, divisi, tanggal dan periode diperiksa sebelum draft diganti. Semua kolom identitas di file bersifat tidak tepercaya dan bukan pengganti otorisasi server.
- Data impor tidak dikirim ke server sampai pengguna menyimpan transaksi atau mengonfirmasi opname. Draft disimpan menggunakan penyimpanan lokal yang sudah ada; jika gagal, draft semula dipertahankan.

## Keterbatasan dan verifikasi

- Hanya file dari template aplikasi yang didukung. Hasil historis opname dapat diimpor kembali hanya saat periode yang sama aktif untuk koreksi. Item/menu yang tidak lagi tersedia atau satuan yang berubah ditolak.
- File ditangani di perangkat pengguna; hindari file dari sumber tidak dikenal. Batas ukuran file bukan jaminan terhadap semua file berbahaya atau penggunaan memori tinggi.
- Uji otomatis mencakup kesesuaian konteks, kesalahan format, rumus, duplikasi, jumlah, perlindungan draft dan kegagalan penyimpanan. Pengujian visual serta uji dengan akun dan data asli masih diperlukan.

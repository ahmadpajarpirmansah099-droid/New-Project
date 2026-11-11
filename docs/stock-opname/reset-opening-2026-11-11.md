# Isi ulang Stock Awal pertama

## Perilaku yang disengaja

Admin Lazy Jennie · Bar dapat mengosongkan angka Stock Awal pertama lalu mengisi ulang seluruh bahan, suplies, dan WIP secara manual, termasuk jumlah 0. Tanggal dan ID periode tetap. Transaksi yang sudah tersimpan pada periode itu tetap ada dan tetap terhubung. Stok fisik opname sebelumnya tetap tersedia untuk pengecekan ulang; hasil selisih lama dibatalkan sampai opname diselesaikan ulang.

## Batas keamanan

RPC hanya menerima admin pada divisi aktif melalui `private.so_allowed`. Reset hanya berlaku jika ada tepat satu periode, statusnya `reopened`, dan belum ada periode lanjutan. Revisi state, kunci transaksi, serta ID permintaan mencegah tab lama dan retry menimpa perubahan baru. Pembatasan ada di database, bukan hanya tombol. Tidak mengubah akses divisi lain, autentikasi, atau key localStorage demo.

## Detail implementasi

- `reset-opening-2026-11-11.sql` menambah RPC `stock_opname_reset_opening` dengan aksi `reset` dan `confirm`. Aksi reset mengosongkan `opening`, menandai `opening_pending`, serta menghapus hasil selisih yang tidak lagi sah. Aksi confirm memvalidasi jumlah dan satuan setiap item aktif maupun item historis yang masih perlu dihitung, lalu mengaktifkan kembali periode yang sama.
- Form Stock Awal menampilkan tanggal asli periode, meminta semua jumlah, dan menyimpan draft lokal per jenis form. Sesudah konfirmasi, admin menyelesaikan opname ulang agar selisih mengikuti patokan baru.
- `documents`, `physical`, identitas periode, dan tanggal transaksi tidak diubah.

## Keterbatasan dan risiko

- Fitur ini khusus Stock Awal pertama selama belum ada periode kedua. Jika periode berikutnya sudah aktif, perlu prosedur koreksi lain.
- Setelah reset, transaksi baru hanya dapat disimpan sebagai draft sampai Stock Awal baru dikonfirmasi.
- Harga dan resep snapshot transaksi historis tetap. Perubahan Stock Awal dapat mengubah stok sistem dan selisih opname.
- Form tidak dapat melengkapi item dengan master/resep yang kini tidak valid; perbaiki master lebih dahulu.

## Verifikasi dan status

- Tes UI mencakup reset yang mempertahankan transaksi, form manual kosong, dan konfirmasi ulang.
- SQL perlu diuji dalam transaksi rollback dan dipasang setelah persetujuan user. Data produksi belum direset dan belum diuji melalui akun admin Bar.
- PR, commit, migrasi permanen, dan deploy: belum dibuat saat catatan ini ditulis.

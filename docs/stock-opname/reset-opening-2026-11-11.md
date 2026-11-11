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

- Tes UI mencakup reset yang mempertahankan transaksi, form manual kosong, dan konfirmasi ulang. Seluruh 82 tes lokal lulus; sintaks JavaScript dan pemeriksaan diff lulus.
- Migrasi `stock_opname_reset_opening_20261111` telah diterapkan setelah persetujuan user. Uji RPC reset dan konfirmasi dengan rollback berhasil: 213 dokumen tetap ada, 105 barang dapat dikonfirmasi ulang, dan revisi produksi tidak berubah selama uji.
- PR #235 digabung sebagai `c7b2e9b3de020026fc66f936338f587f74666ecd`. Workflow Pages #1013 berhasil; akses langsung ke berkas Pages dari browser pengujian terblokir, sehingga alur form lewat akun Bar belum teruji live.
- Reset sebenarnya dijalankan via SQL connector memakai konteks admin Bar yang berwenang atas permintaan user, bukan klik pribadi admin di browser. Request log mencatat identitas admin tersebut. Revisi naik dari 5 ke 6; `opening` kini kosong dan status `opening_pending`. ID periode, tanggal 1–8 November, 213 dokumen, hash dokumen, serta 105 angka fisik tetap sama; `result` lama dihapus.
- Salinan `opening` lama, katalog awal, revisi, jumlah dan hash dokumen disimpan sebagai `stock_opname_opening_before_reset_20261111.json` untuk pemulihan jika diperlukan. Form manual dan penyelesaian opname ulang masih perlu diuji lewat akun admin Bar.

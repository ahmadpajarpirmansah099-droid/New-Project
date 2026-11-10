# PRD final — Stock Opname New-Project

Disetujui 11 November 2026. Dokumen ini menggabungkan keputusan dan revisi percakapan.

## Ringkasan, tujuan, pengguna

Mengelola bahan, suplies, dan hasil WIP; membandingkan stok sistem dengan stok fisik serta selisih unit/rupiah. Disiapkan untuk semua outlet/divisi, awalnya hanya Lazy Jennie – Bar. Hanya admin divisi mengerjakan transaksi/opname; Developer mengatur aktivasi lingkup.

## Fungsi

- Stock Awal manual satu kali. Berikutnya berasal dari stok fisik opname terakhir, dengan konfirmasi terpisah segera setelah opname selesai.
- Pengeluaran bahan/suplies/WIP: Kalibrasi, RnD, QC, Suplies, Move, Waste, Lainnya.
- Move langsung mengurangi asal dan menambah tujuan aktif. Tujuan belum aktif tidak bisa dipilih. Koreksi ketika tujuan sudah menutup opname menggunakan penyesuaian terkait pada periode aktif kedua pihak.
- Barang Masuk hanya bahan/suplies. Harga invoice opsional, berupa total per barang. Hitung harga per satuan dan perbarui Master Barang otomatis. Jika kosong, pakai harga master tanpa perubahan.
- Produksi WIP: nama WIP dan batch; konsumsi resep dan hasil gr/ml otomatis. Hasil tidak dikoreksi manual.
- Sales: pilih rentang tanggal, semua menu tampil, input total terjual per menu dan simpan massal. Pemakaian mengikuti resep Menu; WIP dipotong tanpa memotong bahan produksinya lagi. Rentang bertumpuk boleh menjadi tambahan setelah peringatan/konfirmasi.

## Hitungan dan data

Stok sistem = Stock Awal periode + Barang Masuk + Move Masuk + Hasil WIP − Pengeluaran (termasuk Move keluar) − Pemakaian Produksi WIP − Pemakaian Sales.

Selisih unit = fisik − sistem. Selisih rupiah = selisih unit × harga satuan dasar. Harga default Master Barang/HPP WIP, diperbarui dengan invoice terbaru. Harga dan resep historis disimpan sebagai snapshot; perubahan berlaku untuk transaksi baru.

Satuan dipilih dari Master Barang dan dikonversi otomatis; WIP mengikuti satuan resep. Stok minus boleh disimpan dengan peringatan. Simpan identitas lingkup/admin, tanggal, periode, dokumen, jumlah, konversi, harga invoice, snapshot resep/harga, transfer terkait, hasil opname, status draft/selesai/konfirmasi.

## UX

1. Isi dan konfirmasi Stock Awal.
2. Catat transaksi harian serta Sales rentang tanggal.
3. Opname kapan saja: sistem terlihat sejak pengisian. Semua fisik wajib terisi termasuk 0.
4. Boleh simpan draft; draft perangkat pulih setelah halaman ditutup. Gagal simpan harus jelas dan retry tidak membuat duplikat.
5. Konfirmasi opname menghitung transaksi periode dan menghasilkan selisih lengkap. Rentang Sales melintasi batas opname menghalangi penyelesaian.
6. Konfirmasi terpisah mengaktifkan fisik sebagai Stock Awal berikutnya; periode lama tidak dihitung lagi.
7. Transaksi setelah opname masuk periode berikutnya, termasuk hari yang sama. Jika Stock Awal belum dikonfirmasi, boleh draft dan baru diproses setelah konfirmasi.
8. Hanya opname terakhir boleh dibuka kembali untuk koreksi dan diselesaikan ulang.
9. Master/resep belum tersedia: input terkait nonaktif dengan alasan dan arahan melengkapi master.

## UI

Ikuti identitas New-Project. Halaman/form khusus Stock Opname; FAB berisi lima turunannya.

HP: satu bahan satu baris, input langsung, tanpa membuka kartu dan tanpa geser horizontal. Stok sistem sebagai teks kecil di bawah nama dalam baris yang sama.

| Bahan / stok sistem | Fisik | Satuan |
|---|---|---|
| Susu Full Cream · 3.000 ml | [2,5] | [Botol] |
| Gula Pasir · 2.000 gr | [1,8] | [Kg] |

Desktop: tabel input langsung dengan kolom Barang, Stok sistem, Fisik, Satuan, dan Konversi fisik. Hasil opname menampilkan Stock Awal, pergerakan transaksi, stok sistem/fisik, harga, selisih unit dan rupiah per barang.

## Hak akses dan batasan

Admin divisi hanya mengelola lingkup yang ditugaskan dan diaktifkan. Developer mengaktifkan outlet/divisi tambahan. Fitur lama tetap kecuali perubahan yang dibutuhkan Stock Opname (termasuk harga invoice Master Barang).

Tahap 1: semua alur stok/opname, form Sales massal, Move, harga invoice, draft, akses, koreksi dan UI responsif. Tahap 2: template Excel Sales sederhana, impor Sales dan ekspor lengkap transaksi/hasil opname. Tidak ada tenggat khusus yang ditentukan.

## Ukuran keberhasilan

Hitungan manual cocok; WIP tidak dipotong ganda; siklus periode tidak mengulang transaksi; input HP tanpa scroll horizontal; desktop nyaman; draft pulih; akses lingkup tepat; Move seimbang di kedua sisi.

## Pertanyaan terbuka

Tidak ada pertanyaan produk yang tertunda dari proses persetujuan. Detail teknis dan batas verifikasi dicatat dalam implementation.md.

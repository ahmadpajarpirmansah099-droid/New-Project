# Stock Opname — dialog konfirmasi dan pergantian form

## Tujuan dan keputusan user

Setelah PR #228 live, user menunjukkan dialog konfirmasi bawaan Android muncul setiap kali berpindah menu FAB, bahkan saat form belum diisi. User meminta tampilannya mengikuti web app dan menghilangkan gangguan saat berpindah form. User juga menegaskan input Pengeluaran, Barang Masuk, dan Produksi WIP dilakukan bertahap sepanjang hari: setiap kejadian yang sudah terjadi disimpan sebagai transaksi; draft hanya untuk isian yang belum selesai atau ketika Stock Awal berikutnya belum dikonfirmasi.

Baseline: main commit `49e06c6266772dddb9a05690ae1aec16cab1c2e1`. Perubahan ini khusus frontend Stock Opname.

## 1. Perilaku yang disengaja

- Berpindah dari form kosong tidak meminta konfirmasi. Form dan draft kosong yang lama boleh digantikan.
- Jumlah yang diisi, termasuk angka `0`, serta invoice, tanggal yang diedit, kategori Pengeluaran nondefault, tujuan Move, mapping, atau dokumen yang sedang diedit tetap dilindungi. Pindah form meminta persetujuan di dialog dalam aplikasi; Batal mempertahankan draft dan isian.
- Semua konfirmasi Stock Opname menggunakan dialog bergaya New-Project, termasuk transaksi, Sales bertumpuk, pembatalan, koreksi Move, aktivasi, dan Stock Awal berikutnya. Tombol Batal, Escape, sentuhan area luar, dan sign-out menutupnya sebagai penolakan.
- Simpan Transaksi memproses kejadian yang sudah terjadi dan memperbarui stok. Simpan Draft hanya menyimpan isian di perangkat. Form tiga transaksi operasional menjelaskan perbedaannya.

## 2. Batas keamanan

- Tidak mengubah perhitungan, server, RLS/RPC, autentikasi, izin admin, status Stock Awal, payload transaksi, ID request untuk retry, atau key localStorage.
- Dialog hanya mengganti presentasi persetujuan pengguna. Aksi penting tetap membutuhkan konfirmasi dan Batal tidak menulis database.
- Pesan dialog dimasukkan melalui `textContent` agar data yang tampil tidak menjadi HTML. Dialog menggunakan elemen native `dialog` dengan `showModal()` dan fokus kembali ke pemicu setelah ditutup.

## 3. Detail implementasi

| File | Perubahan |
| --- | --- |
| `assets/js/stock-opname-ui.js` | Deteksi draft berisi, dialog dalam aplikasi, semua aksi konfirmasi, petunjuk simpan transaksi/draft |
| `assets/css/stock-opname.css` | Dialog responsif memakai token, shadow, tipografi, dan tombol lime New-Project |
| `tests/stock-opname-ui.test.js` | Regresi form kosong, angka 0, perlindungan draft, dan pelarangan konfirmasi browser pada alur yang diuji |

## 4. Keterbatasan yang diketahui

- Pengujian VM/DOM sederhana memeriksa alur persetujuan, bukan tampilan nyata Android. Dialog dan pengaturan fokus pada browser produksi masih perlu diperiksa melalui akun admin Bar.
- Blank draft lama tetap dapat dipulihkan, tetapi tidak memicu peringatan pergantian. Perubahan field baru ditandai pada form dan tersimpan dalam draft; draft lama sebelum revisi ini tetap dilindungi berdasarkan jumlah/kategori/tujuan yang ada.

## 5. Risiko yang masih perlu diuji

- Pindah cepat antar lima menu pada Android: form kosong langsung berganti; form berisi menampilkan dialog; Batal mempertahankan data.
- Uji keyboard Escape, fokus tombol, tampilan 320px, dan logout saat dialog terbuka.
- Simpan Transaksi dari akun admin Bar untuk satu kejadian nyata, lalu ulang kejadian lain; pastikan stok mengikuti transaksi yang sudah disimpan. Jangan membuat data operasional palsu hanya untuk uji tampilan.

## 6. Status verifikasi

- 80 tes Node lulus, 0 gagal. Syntax check JavaScript, grammar CSS, dan `git diff --check` lulus.
- Perubahan belum dinyatakan merged/deployed sebelum status GitHub mengonfirmasinya. Tidak ada migration baru.

# Stock Opname — tindak lanjut PR #226

## Tujuan dan keputusan user

User memberikan PRD final lengkap dan mengizinkan melanjutkan pengerjaan setelah review PR #226. Scope perbaikan: integritas Move, kategori transaksi/hasil opname, pemulihan draft, serta kelengkapan tabel desktop dan arahan master yang sudah diminta PRD. Tahap 2 tetap terpisah. Pemasangan database produksi dan penggabungan PR perbaikan belum dilakukan dalam pekerjaan ini.

Baseline yang diperiksa: `main` pada merge commit `837e6e13662d9e34d873f16b926afa48137d9ed7`. Pemeriksaan SELECT ke project Supabase New-Project pada 11 November 2026 menemukan tabel `stock_opname_scopes`, `stock_opname_state`, dan RPC `stock_opname_write` belum terpasang. Daftar migration juga belum memuat Stock Opname.

## 1. Perilaku yang disengaja

- Move tetap langsung diproses di kedua pihak, tanpa konfirmasi penerimaan. Tujuan kosong ditolak. Penyesuaian hanya membalik Move yang masih berlaku pada periode aktif kedua divisi.
- Dokumen yang dibatalkan tidak dapat dihidupkan kembali lewat edit atau dibalik lagi lewat penyesuaian. Retry dengan request ID yang sudah berhasil tetap mengembalikan hasil tanpa mutasi baru.
- Kategori Kalibrasi/RnD/QC/Suplies/Move/Waste/Lainnya hanya untuk Pengeluaran. Barang Masuk, Produksi WIP, dan Sales dikelompokkan menurut jenisnya, termasuk saat menghitung dokumen dari client lama yang salah mengirim kategori.
- Tetap satu draft lokal per akun/outlet/divisi. Membuka form baru meminta konfirmasi eksplisit sebelum menimpa draft, termasuk setelah form lama ditutup. Penolakan mempertahankan draft dan pengguna dapat memulihkannya.
- Jika penyimpanan perangkat gagal, form tetap terbuka dan status tidak mengklaim draft berhasil. Menyimpan transaksi langsung ke database masih dapat dicoba.
- Tabel hitung desktop memiliki lima kolom sesuai PRD; HP tetap satu bahan per baris. Input master/resep yang tidak valid tetap nonaktif dan disertai arahan menuju halaman master.

## 2. Batas keamanan

- Tidak mengubah autentikasi, role, RLS, grant, atau persyaratan penugasan admin/divisi yang sudah ada di schema Stock Opname.
- Validasi Move dan kategori dilakukan kembali di server; tidak bergantung pada UI.
- Penolakan Move tidak mengubah saldo, revision, dokumen tujuan, atau catatan request di kedua pihak.
- Tidak mengubah key `waitlist_frontend_demo_v1` maupun key draft Stock Opname. Tidak menghapus data pengguna atau memodifikasi database produksi.
- Snapshot historis yang sudah ditutup tidak ditulis ulang. Perubahan pengelompokan diterapkan saat hasil opname baru dihitung.

## 3. Detail implementasi

| File | Perubahan |
| --- | --- |
| `assets/js/stock-opname-ui.js` | Konfirmasi penggantian draft, status gagal simpan, validasi tujuan Move, kategori khusus Pengeluaran, kolom desktop, tautan ke master |
| `assets/css/stock-opname.css` | Lebar kolom berdasarkan fungsi dan dua kolom desktop mulai 900px |
| `docs/stock-opname/schema.sql` | Tolak dokumen void dan Move tanpa tujuan, penyesuaian hanya di periode aktif, normalisasi kategori dan pengelompokan pergerakan |
| `tests/stock-opname-ui.test.js` | Sepuluh tes form/draft/kategori/konversi/validasi dan retry |
| `tests/stock-opname-database.sql` | Skenario lama ditambah kategori client lama dan larangan penyesuaian pada periode koreksi |
| `tests/stock-opname-regression.sql` | Pembalikan Move batal, retry pembatalan, Move tanpa tujuan, kategori palsu dan ketepatan hasil |
| `.github/workflows/deploy-pages.yml` | Menjalankan tes UI baru dalam pemeriksaan yang sudah ada |
| `docs/stock-opname/PRD.md`, `design.md`, `implementation.md` | Menyelaraskan kolom desktop dan mencatat status/penerapan |

Tidak ada dependency aplikasi, perubahan service Master Data, perubahan data Guest, atau migration yang diterapkan. `schema.sql` tetap merupakan kandidat pemasangan awal; jangan menjalankan versi lama dari PR #226 setelah perbaikan ini disetujui.

## 4. Keterbatasan yang diketahui

- Pengujian SQL lanjutan menggunakan PGlite 0.5.16 / PostgreSQL 18.6 lokal dengan tabel fondasi dan identitas dummy minimal. Ini mengeksekusi fungsi SQL asli, bukan simulasi hitungan JavaScript, tetapi tidak mereplikasi seluruh trigger/constraint/RLS Supabase produksi yang menggunakan PostgreSQL 17.11.
- Pengujian UI menggunakan VM JavaScript dan DOM fixture sederhana. Belum membuktikan ukuran aktual, focus/keyboard, atau integrasi penuh shell aplikasi pada desktop/HP.
- Chromium lokal gagal membuka socket. Unduhan browser pengganti gagal dengan arsip tidak valid; browser cloud menolak protokol file lokal. Tidak ada klaim screenshot/browser baru atau pengujian lewat akun admin Bar.
- Satu slot draft masih membutuhkan konfirmasi jika ingin mengganti isian. Tidak ditambahkan daftar banyak draft.
- Impor/ekspor Excel belum dikerjakan sesuai pembagian tahap dalam PRD.

## 5. Risiko yang masih perlu diuji

- Setelah persetujuan pemasangan, cek fungsi dengan skema/role produksi dan uji alur akun admin Bar, penolakan akun/divisi yang tidak ditugaskan, serta kontrol aktivasi Developer.
- Uji tampilan pada HP 320px/390px dan desktop, termasuk nama panjang, invoice, baris master invalid, konversi, serta tombol master di shell asli.
- Uji dua tab/perangkat, kegagalan jaringan setelah commit, koreksi Move lintas periode, dan pemulihan draft setelah login ulang. Proteksi revision/request tetap ada, tetapi pengujian integrasi multi-perangkat belum dilakukan di sini.

## 6. Status verifikasi dan penerapan

- Sebelum perbaikan: tujuh dari delapan tes regresi UI awal gagal; tes SQL berhasil membuktikan Move batal masih menerima penyesuaian.
- Sesudah perbaikan: 77 tes Node lulus (0 gagal), 21 file JavaScript lulus syntax check, dan kedua skrip SQL lulus di database lokal. Status CI remote dicatat di PR perbaikan.
- `tests/stock-opname-database.sql` dan `tests/stock-opname-regression.sql` dijalankan di transaksi terpisah yang diakhiri ROLLBACK pada database lokal disposable. Tidak menggunakan data tamu atau kredensial pengguna asli.
- PR #226 sudah merged dan workflow pasca-merge sukses. Itu tidak membuktikan fitur operasional siap atau schema sudah diterapkan.
- PR perbaikan: lihat PR yang memperkenalkan dokumen ini untuk SHA/CI. Dokumen ini tidak menyatakan merged/deployed sebelum GitHub mengonfirmasinya.
- Migration/database produksi: belum dipasang. Verifikasi browser live: belum dilakukan. Aktivasi tambahan: belum dilakukan.

Catatan review visual berdasarkan kode: arah tabel operasional padat, token/typography/motion lama dipertahankan. AI-slop score sementara 1/10, distinctiveness 8/10; penilaian visual final menunggu render browser.

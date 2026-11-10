# Stock Opname — tindak lanjut PR #226

## Tujuan dan keputusan user

User memberikan PRD final lengkap dan mengizinkan melanjutkan pengerjaan setelah review PR #226. Scope perbaikan: integritas Move, kategori transaksi/hasil opname, pemulihan draft, serta kelengkapan tabel desktop dan arahan master yang sudah diminta PRD. Tahap 2 tetap terpisah. Setelah PR #227 dan SQL yang sudah diuji disiapkan, user menjawab “Boleh” untuk penggabungan PR dan pemasangan schema Lazy Jennie–Bar. Hasil penerapan dicatat pada bagian 7.

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
- Tidak mengubah key `waitlist_frontend_demo_v1` maupun key draft Stock Opname. Tidak menghapus data pengguna. Pemasangan database produksi dilakukan hanya setelah persetujuan terpisah, dengan rincian pada bagian 7.
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

Tidak ada dependency aplikasi, perubahan service Master Data, atau perubahan data Guest dalam perbaikan ini. `schema.sql` yang sudah diperbaiki menjadi sumber pemasangan awal setelah persetujuan; jangan menjalankan versi lama dari PR #226.

## 4. Keterbatasan yang diketahui

- Pengujian SQL awal menggunakan PGlite 0.5.16 / PostgreSQL 18.6 lokal dengan tabel fondasi dan identitas dummy minimal. Setelah pemasangan yang disetujui, kedua skrip juga lulus pada Supabase produksi PostgreSQL 17.11 dengan seluruh perubahan fixture di-rollback. Ini belum menggantikan pengujian melalui UI akun asli.
- Pengujian UI menggunakan VM JavaScript dan DOM fixture sederhana. Belum membuktikan ukuran aktual, focus/keyboard, atau integrasi penuh shell aplikasi pada desktop/HP.
- Chromium lokal gagal membuka socket. Unduhan browser pengganti gagal dengan arsip tidak valid; browser cloud menolak protokol file lokal. Setelah deploy, halaman login HTTPS produksi berhasil diperiksa; sesi browser belum login sebagai admin Bar sehingga form operasional belum diuji ulang secara visual.
- Satu slot draft masih membutuhkan konfirmasi jika ingin mengganti isian. Tidak ditambahkan daftar banyak draft.
- Impor/ekspor Excel belum dikerjakan sesuai pembagian tahap dalam PRD.

## 5. Risiko yang masih perlu diuji

- Fungsi, akses database admin, dan penolakan lingkup yang tidak ditugaskan sudah diperiksa setelah pemasangan. Masih perlu uji alur melalui login akun admin Bar dan kontrol aktivasi Developer dari aplikasi.
- Uji tampilan pada HP 320px/390px dan desktop, termasuk nama panjang, invoice, baris master invalid, konversi, serta tombol master di shell asli.
- Uji dua tab/perangkat, kegagalan jaringan setelah commit, koreksi Move lintas periode, dan pemulihan draft setelah login ulang. Proteksi revision/request tetap ada, tetapi pengujian integrasi multi-perangkat belum dilakukan di sini.

## 6. Verifikasi sebelum pemasangan

- Sebelum perbaikan: tujuh dari delapan tes regresi UI awal gagal; tes SQL berhasil membuktikan Move batal masih menerima penyesuaian.
- Sesudah perbaikan: 77 tes Node lulus (0 gagal), 21 file JavaScript lulus syntax check, dan kedua skrip SQL lulus di database lokal. Status CI remote dicatat di PR perbaikan.
- `tests/stock-opname-database.sql` dan `tests/stock-opname-regression.sql` dijalankan di transaksi terpisah yang diakhiri ROLLBACK pada database lokal disposable. Tidak menggunakan data tamu atau kredensial pengguna asli.
- PR #226 sudah merged dan workflow pasca-merge sukses. Itu tidak membuktikan fitur operasional siap atau schema sudah diterapkan.
- PR perbaikan: lihat PR yang memperkenalkan dokumen ini untuk SHA/CI. Dokumen ini tidak menyatakan merged/deployed sebelum GitHub mengonfirmasinya.
- Pada tahap persiapan ini migration/database produksi belum dipasang dan verifikasi browser live belum dilakukan. Status setelah izin user ada pada bagian 7.

Catatan review visual berdasarkan kode: arah tabel operasional padat, token/typography/motion lama dipertahankan. AI-slop score sementara 1/10, distinctiveness 8/10; penilaian visual final menunggu render browser.

## 7. Penerapan setelah persetujuan — 11 November 2026 (Asia/Jakarta)

- Persetujuan: user mengizinkan merge PR #227 dan pemasangan schema Stock Opname untuk Lazy Jennie–Bar. Tidak ada izin aktivasi outlet/divisi tambahan atau pengerjaan tahap 2.
- Sumber SQL: `docs/stock-opname/schema.sql` pada head PR #227 `53603691cf909cfeabc33bc2092fd9b10f543068`, Git blob `738b81f8b4d5e81a9bea5af47282e870ed6a2241`.
- Migration terpasang: `20261110183229_stock_opname_phase_one_reviewed_v1`. SQL dipasang sebagai satu migration sebelum merge frontend.
- Merge: [PR #227](https://github.com/ahmadpajarpirmansah099-droid/New-Project/pull/227), commit `e9b4f752648ac9a2b7001233bf80863afe3a4415`.
- Frontend: [workflow 42876328652](https://github.com/ahmadpajarpirmansah099-droid/New-Project/actions/runs/42876328652) menunjukkan validate dan deploy success. Halaman login live HTTPS berhasil tampil di browser. Aset live `stock-opname-ui.js` dan `stock-opname.css` mengembalikan HTTP 200 dan isinya identik dengan file yang direview.
- Kedua skrip `tests/stock-opname-database.sql` dan `tests/stock-opname-regression.sql` dijalankan kembali di Supabase, masing-masing dalam BEGIN/ROLLBACK. Keduanya lulus tanpa error. Pengecekan setelahnya menemukan 0 workspace fixture, 0 state stok, dan 0 request tersimpan.
- Scope aktif tepat satu: Lazy Jennie–Bar. Terdapat satu admin yang ditugaskan dan katalog 159 baris, seluruhnya valid menurut validasi server. Tidak ada Stock Awal atau transaksi operasional yang diisi atas nama admin.
- RLS aktif pada ketiga tabel baru. Role anonymous tidak memiliki SELECT; authenticated tidak memiliki INSERT/UPDATE/DELETE langsung. SELECT authenticated hanya tersedia pada scopes/state sesuai kebijakan akses, bukan tabel request. Empat RPC publik adalah SECURITY INVOKER, EXECUTE hanya untuk authenticated; helper privat memvalidasi identitas dan lingkup.
- Uji transaksi dengan identitas admin yang ditugaskan dan role authenticated berhasil membaca scope aktif serta menolak lingkup lain yang tidak ditugaskan. Ini uji hak akses database, bukan login browser atau pengujian penuh dari akun admin.

### Hasil pemeriksaan keamanan setelah pemasangan

- Advisor memberi INFO `rls_enabled_no_policy` pada `stock_opname_requests`. Ini sesuai desain deny-all untuk log request internal: tidak ada grant ke anon/authenticated dan tidak ada policy akses langsung. Akses hanya melalui helper privat yang memeriksa identitas/lingkup. Tidak ditambahkan policy permisif untuk menghilangkan INFO tersebut. Lihat [penjelasan advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Empat WARN fungsi SECURITY DEFINER pada User Monitoring dan WARN leaked-password protection nonaktif sudah ada pada pemeriksaan sebelum perubahan; bukan temuan baru dari Stock Opname dan tidak diperbaiki di scope ini. Temuan tetap perlu ditinjau terpisah, bukan diabaikan karena merupakan perilaku lama. Referensi: [fungsi exposed](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [proteksi password](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Status akhir: kode merged, deploy frontend sukses, migration database terpasang, uji SQL dan hak akses database lulus. Pengujian alur lengkap serta tampilan melalui sesi login admin Bar masih belum dilakukan. Tahap 1 belum dinyatakan terverifikasi penuh; tahap 2 belum dimulai.

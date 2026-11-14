# Implementation and rollout

## Dialog and draft follow-up — 11 November 2026

See `dialog-draft-2026-11-11.md` for the Android confirmation fix, blank-draft behavior, operational transaction guidance, security boundaries, and remaining device checks. Merge/deploy status is recorded in its implementing PR. No database change is involved.

## Draft retention follow-up — 11 November 2026

See `draft-retention-2026-11-11.md` for the fix that keeps separate local drafts for each Stock Opname form type when users switch between forms. It retains the existing account/workspace/division-scoped localStorage key. PR and deployment status are recorded in that follow-up; there is no database change.

## Web picker follow-up — 11 November 2026

See `web-pickers-2026-11-11.md` for replacing Android-native date and selection popups in Stock Opname with web-styled in-app dialogs. Values and backend flows remain unchanged; rollout is tracked in its implementing PR.

## UI follow-up — 11 November 2026

See `ui-polish-2026-11-11.md` for the FAB overlap/icon fix and shared form styling requested after rollout. This is a frontend-only follow-up with no new migration; its merge/deploy status is tracked separately in the implementing PR. It does not change the database deployment recorded below.

## Follow-up review — 11 November 2026

See `review-followup-2026-11-11.md` for user decisions, intended behavior, security boundaries, fixes, regression coverage, and remaining verification. Following explicit owner approval, PR #227 was merged as `e9b4f752648ac9a2b7001233bf80863afe3a4415`. The corrected `schema.sql` was installed as Supabase migration `20261110183229_stock_opname_phase_one_reviewed_v1` before the merge. Do not apply the original PR #226 SQL.

The follow-up adds guards for cancelled/targetless Moves, separates expense categories from receipt/production/Sales, protects local drafts from silent replacement, and completes the desktop counting columns/master-data guidance. Both SQL scripts passed locally and subsequently against the installed Supabase schema in separate transactions ending in ROLLBACK. Full authenticated browser and responsive verification remain pending.

## Deployment status — 11 November 2026 (Asia/Jakarta)

- Code: PR #226 and PR #227 merged.
- Frontend: [post-merge workflow 42876328652](https://github.com/ahmadpajarpirmansah099-droid/New-Project/actions/runs/42876328652) passed validation and GitHub Pages deployment. The public live login page loaded successfully in the browser. The live `stock-opname-ui.js` and `stock-opname.css` responses were HTTP 200 and matched the reviewed files byte-for-byte.
- Database: migration `20261110183229_stock_opname_phase_one_reviewed_v1` installed. Its SQL is exactly `docs/stock-opname/schema.sql` at PR #227 head `53603691cf909cfeabc33bc2092fd9b10f543068` (Git blob `738b81f8b4d5e81a9bea5af47282e870ed6a2241`).
- Activation: only Lazy Jennie / Bar enabled. One assigned admin and 159 valid inventory catalog rows were found; no other scope was enabled.
- Data: no opening quantities or operational transactions seeded; state/request tables and rollback test workspaces were empty after verification.
- Access: all three new tables have RLS, no anonymous SELECT, and no authenticated direct writes. The four public RPC wrappers are SECURITY INVOKER with authenticated-only execution. A transaction using the assigned admin's database role could read the enabled scope and could not read an unassigned scope.
- Remaining: browser session is unauthenticated. Database-role checks do not prove the complete login, operational UI, responsive layout, or real-account end-to-end flow. Phase two remains deferred.

## Deployment order

1. Review `schema.sql` and apply it as one additive Supabase migration before merging the frontend. The change creates only the Stock Opname tables/functions and enables the existing Lazy Jennie / Bar scope by name. No initial quantities or transactions are seeded.
2. Merge frontend after database checks pass. The navigation remains hidden when the schema is unavailable; other modules continue loading.
3. Verify with the existing Bar division administrator. Developer sees activation controls rather than operational stock data.

Production schema installation is complete. The database scenarios run after installation used isolated fixtures and transactions ending in ROLLBACK; test data did not persist. Operational inventory remains for the assigned administrator to initialize with real quantities.

## Integrity

- Server calculates stock movements, conversion, recipe consumption, invoice prices and variance from the protected master catalog.
- Only division_admin membership plus protected admin profile and explicit division assignment can operate enabled scopes.
- Private SECURITY DEFINER entry helpers check identity and scope; exposed RPC wrappers are SECURITY INVOKER. Tables have RLS and no authenticated write grants.
- Version checks prevent lost inventory updates. Request UUID + payload hash prevents duplicate or mismatched retries.
- Transfers and linked reversals update both scopes in one transaction under a serialization lock.
- Reopening the latest closed period holds the following period. Existing later transactions remain retained and are recomputed against the reconfirmed physical opening.
- Mapping inventory between divisions is explicit and requires the same base unit; independently maintained catalogs need not share IDs.
- Drafts are local to account/workspace/division. A pending-period draft is restored and explicitly saved after opening confirmation; it never silently posts while the opening is pending.

## Validation

- Node suite including the follow-up UI regression tests: 77 passing, 0 failures; syntax checks passed for 21 JavaScript files.
- Rollback database scenarios: initial/production/conversion/Sales without double consumption, overlap guard, invoice price update, WIP waste, atomic Move, optimistic conflict, required counts, variance, pending confirmation, rollover, reopen/hold/reconfirm, linked Move reversal, negative stock, authenticated read/direct-write denial, anonymous rejection.
- PR #226 reported browser fixture checks: direct quantity/unit entry, draft save/restoration after reload, compact form at a 320px iframe viewport (305px content area with scrollbar), equal scrollWidth/clientWidth. These checks use controlled fixtures, not a production account; follow-up visual changes have not been revalidated in an authenticated browser.
- Follow-up database regression scripts both passed on Supabase after migration, with ROLLBACK and no remaining test workspaces. See the follow-up record for cases and access checks.

## Limits and follow-up

- Excel intentionally deferred to phase two.
- Code deployment and database migration are complete; the authenticated production browser smoke test is still required before calling phase one fully verified.
- A single serialization lock favors correctness over throughput for the initial outlet. Full per-document catalog snapshots and JSON period storage should be measured before broad rollout.
- MasterDataStore now conditionally writes the version it loaded, so a stale master editing tab cannot overwrite an invoice price update. It asks the administrator to reload on a conflict.

## Design review

Dense operational ledger, inherited New-Project typography and lime/navy identity, 44px controls, functional transitions and reduced-motion support. AI-slop score 1/10; distinctiveness 8/10; implementation direction readiness 9/10. Remaining visual verification: the authenticated full app shell, beyond the isolated form fixture.

## Koreksi draft opname kosong (2026-11-11)

- **Perilaku yang disengaja:** Saat opname terakhir dibuka untuk koreksi, form mengambil angka fisik yang sudah tersimpan. Draft lokal untuk periode yang sama mempertahankan setiap angka yang sudah diisi, termasuk 0; barang dengan jumlah kosong atau belum ada di draft diisi dari opname tersimpan.
- **Batas keamanan:** Pemulihan memakai data periode dari pembacaan divisi yang sudah dibatasi server. Tidak ada perubahan pada RPC, RLS, autentikasi, data transaksi, atau kunci localStorage.
- **Implementasi:** `assets/js/stock-opname-ui.js` menggabungkan angka fisik tersimpan dengan draft koreksi saat membuka form dan saat menekan Pulihkan Draft. Draft yang diisi kembali disimpan pada perangkat; notifikasi menjelaskan sumber angka tersebut.
- **Keterbatasan:** Angka baru yang sudah tertimpa di penyimpanan perangkat dan belum pernah dikirim ke database tidak bisa dipulihkan dari database. Angka fisik opname terakhir masih tersedia, tetapi koreksi yang belum tersimpan di sana harus diperiksa ulang.
- **Risiko dan verifikasi:** Tes UI mencakup draft kosong, koreksi parsial, angka 0, kolom yang sengaja dikosongkan, dan pemulihan manual; suite lokal 87 lulus, 0 gagal, dan pemeriksaan sintaks lulus. Pengujian visual pada sesi Android admin Bar setelah deploy masih diperlukan. Perubahan frontend saja, tanpa migrasi database.

## Koreksi tanggal 8 November dan form aktif (2026-11-11)

- **Perilaku yang disengaja:** Opname Bar untuk transaksi hingga 8 November 2026 ditandai 8 November, dan periode berikutnya mulai pada batas yang sama. Saat form koreksi sudah terbuka, Muat Ulang mengisi jumlah fisik kosong dari opname tersimpan, mempertahankan jumlah yang sudah diketik (termasuk 0), serta mengembalikan tanggal form yang melewati akhir opname ke tanggal akhir tersebut.
- **Batas keamanan:** Perubahan tampilan hanya menggunakan state dari RPC yang dibatasi divisi. Tidak mengubah hak akses, autentikasi, RLS, RPC, struktur database, atau kunci draft.
- **Data:** Koreksi terarah pada `public.stock_opname_state` divisi Lazy Jennie · Bar dari revision 15 ke 16: `periods[0].end` dan `periods[1].start` diubah dari `2026-11-11` ke `2026-11-08`. Pembaruan memakai syarat revision, ID/status kedua periode, tanggal lama, tidak ada transaksi periode pertama setelah 8 November, dan tidak ada transaksi pada periode kedua. Verifikasi sesudahnya: 105 hasil, 105 stok fisik, 214 transaksi tetap ada.
- **Implementasi dan risiko:** `assets/js/stock-opname-ui.js` memperbaiki pemulihan pada draft yang berisi baris dengan jumlah kosong dan pada tombol Muat Ulang. Jumlah kosong yang sengaja dibersihkan akan kembali ke angka opname sebelumnya; pengguna perlu mengetik `0` untuk fisik nol. Angka koreksi yang sebelumnya sudah tertimpa sebelum masuk database tidak dapat dipulihkan persis.
- **Verifikasi:** 88 tes otomatis lokal lulus, 0 gagal; pemeriksaan sintaks lulus. Pemeriksaan form pada Android dengan akun admin Bar setelah deploy masih diperlukan. Perubahan antarmuka melalui PR lanjutan; data tanggal dikoreksi langsung tanpa migration.

## Pembatalan koreksi opname 8 November (2026-11-11)

- **Perilaku yang disengaja:** Atas permintaan admin Bar, opname terakhir tanggal 8 November kembali berstatus selesai, dan periode lanjutan aktif. Draft koreksi untuk periode lama diabaikan ketika halaman dimuat ulang agar tidak terbawa ke form periode berikutnya.
- **Batas keamanan:** Koreksi data hanya pada divisi Bar dengan revision guard dan pemeriksaan ID/status periode, tanggal, serta satu transaksi yang muncul sesudah opname ditutup. Tidak ada perubahan RLS, RPC, autentikasi, struktur database, atau kunci penyimpanan demo.
- **Implementasi data:** `stock_opname_state` revision 17 → 18. Status periode pertama `reopened → closed`, periode lanjutan `held → active`. Barang Masuk Scone Cake 600 GR tanggal 2 November yang tersimpan saat koreksi dipertahankan; satu baris hasil Scone Cake dihitung ulang: sistem 97 → 697 GR, fisik 568 GR, selisih 471 → −129 GR, nilai Rp76.537,5 → Rp−20.962,5. Seluruh 215 transaksi dipertahankan.
- **Verifikasi:** 105 hasil dan 105 stok fisik tetap ada. Pengecekan seluruh barang terhadap perhitungan saldo, fisik, selisih unit, selisih rupiah, dan stok awal periode berikutnya menghasilkan 0 ketidakcocokan. Tes frontend lokal 89 lulus, 0 gagal; sintaks lulus.
- **Keterbatasan dan risiko:** Draft koreksi lokal perangkat tidak dapat dihapus dari database; frontend menghapusnya saat pengguna memuat ulang atau mencoba membuka form lama. Angka yang hanya ada di draft lama tidak digunakan dalam hasil opname yang sudah selesai. Pemeriksaan langsung pada Android admin Bar setelah deploy masih diperlukan.

## Riwayat per fitur — 11 November 2026

1. Perilaku disengaja: Riwayat Stock Awal, Pengeluaran (termasuk Move), Barang Masuk, Produksi WIP, Sales, dan hasil Stock Opname dipilih masing-masing. Membuka form memilih riwayatnya; daftar lain dapat dipilih tanpa mengubah draft. Setiap daftar menampilkan 10 catatan terlebih dahulu, lalu tombol untuk menampilkan lebih banyak.
2. Batas keamanan: tampilan hanya memfilter data lingkup yang sudah diperoleh lewat akses Stock Opname; hak Edit, Batalkan, dan penyesuaian Move tetap mengikuti batas periode dan status sebelumnya. Tidak mengubah otorisasi server.
3. Implementasi: `assets/js/stock-opname-ui.js`, `assets/css/stock-opname.css`, `index.html`, dan `tests/stock-opname-ui.test.js`. Stock Awal dibaca dari snapshot periode; rincian transaksi dan hasil opname tetap dapat dibuka. Cache URL aset diperbarui.
4. Keterbatasan: pilihan riwayat kembali ke Stock Opname setelah halaman/login dimuat ulang; hal ini tidak memengaruhi data. Tidak ada migrasi, RPC, RLS, autentikasi, atau kunci penyimpanan yang berubah.
5. Risiko yang masih perlu diuji: tampilan fisik pada akun admin Bar dan perangkat Android 320px setelah deploy; Chromium lokal tidak dapat dijalankan karena sandbox menolak socket.
6. Verifikasi: 91 tes Node lulus, 0 gagal; `node --check` lulus. Status PR, merge, dan Pages dilaporkan terpisah setelah penerapan.

## 11 November 2026: pergantian Stock Awal harian dan pencarian Barang Masuk

1. Intended behavior: hasil Stock Opname tanggal X menjadi Stock Awal tanggal X+1. Barang Masuk memilih nama barang satu per satu melalui saran pencarian; beberapa barang tetap disimpan bersama sebagai satu transaksi.
2. Security boundaries: tidak ada perubahan role, RLS, hak akses, RPC publik, struktur tabel, atau data historis transaksi. Fungsi private.so_mutate tetap SECURITY DEFINER dan privilege lama. Kunci waitlist_frontend_demo_v1 tidak disentuh.
3. Implementation: migrasi Supabase 20261111072028 / stock_opname_next_day_opening_and_lj_bar_date_fix_20261111 memperbaiki activate dan reactivate. Koreksi terjaga pada Bar / Lazy Jennie mengubah hanya tanggal mulai periode kedua dari 2026-11-08 ke 2026-11-09, dan menaikkan revision dari 18 ke 19. Sumber aturan di docs/stock-opname/schema.sql. Form receipt mencari katalog divisi yang sudah berizin dan memelihara pilihan dalam draft lokal; pencarian tidak mengubah stok sebelum submit.
4. Known limitations: saran pencarian menampilkan hingga delapan barang cocok sekaligus; katalog bergantung pada data yang dimuat untuk divisi aktif. Data lama tidak didistribusikan ulang.
5. Risk checks: sebelum perubahan, 105 barang tepat sama dengan hasil fisik opname dan belum ada transaksi periode baru. Migrasi mengunci state dan memeriksa revision, status, outlet/divisi, hubungan periode, kesamaan jumlah stok dan ketiadaan transaksi sebelum memperbaiki tanggal. Reactivation menolak transaksi yang lebih awal daripada tanggal Stock Awal baru.
6. Verification: setelah migrasi tanggal 2026-11-09, 105 barang tidak berubah, total 215 dokumen historis tetap tersimpan, tanpa transaksi pada periode kedua, serta privilege fungsi tetap authenticated:EXECUTE dan postgres:EXECUTE. Pengujian UI ada di tests/stock-opname-ui.test.js. Pemeriksaan manual mobile/desktop masih diperlukan; PR/merge/deploy frontend dicatat di GitHub.

## Riwayat dan form aktif (14 November 2026)

Perpindahan kategori riwayat dan tombol tampilkan lebih banyak hanya memperbarui panel riwayat, sehingga form dan draft yang sedang terbuka tidak digambar ulang. Berlaku untuk seluruh kategori riwayat. Tidak ada perubahan alur data, akses, database, RLS, RPC, autentikasi, atau penyimpanan. Tes otomatis memeriksa pergantian kategori dan penambahan riwayat tanpa render ulang form atau transaksi baru; pemeriksaan visual di browser tetap diperlukan.

## Pencarian barang Pengeluaran (14 November 2026)

Form Pengeluaran memakai pencarian untuk memilih bahan atau WIP satu per satu; barang terpilih dapat dilepas dari draft. Draft lama dipulihkan dari item yang sudah memiliki jumlah, termasuk nol. Penghapusan item dari draft juga membersihkan padanan Move untuk item itu; transaksi tersimpan tidak dihapus. Kategori, pilihan satuan, tujuan Move, alur konfirmasi dan hak akses tetap mengikuti mekanisme semula. Tidak ada perubahan database, RLS, RPC, autentikasi atau nama kunci penyimpanan. Uji otomatis mencakup pencarian, pemilihan WIP, pemulihan draft lama, penghapusan pilihan dan pengiriman Move; pemeriksaan visual browser serta data asli belum dilakukan.

Pilihan kategori Pengeluaran menggunakan dropdown web di dekat kolom pada HP dan desktop. Pergantian kategori tetap disimpan di draft dan kategori Move tetap menggunakan pemeriksaan tujuan/padanan yang sama. Tes otomatis memeriksa pilihan kategori, draft dan blokir Move tanpa tujuan; interaksi browser dan tampilan visual belum terverifikasi.

## Stabilitas form Pengeluaran (14 November 2026)

Memilih/menghapus barang, memilih kategori, dan memilih satuan pada Pengeluaran memperbarui bagian form terkait tanpa membangun ulang halaman atau kartu form. Dialog pilihan satuan/tujuan di HP juga tidak membangun ulang halaman ketika dibuka atau dipilih. Draft tetap disimpan dengan mekanisme yang ada; jika penyimpanan gagal, halaman menampilkan kesalahan menggunakan alur sebelumnya. Tidak ada perubahan akses, database, RPC, RLS atau perhitungan. Tes otomatis memeriksa bagian yang diperbarui, isi draft dan tidak ada transaksi baru; pengujian visual browser masih diperlukan.

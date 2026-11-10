# Stock Opname — mempertahankan draft per form

## 1. Perilaku yang diminta

Admin mengisi Produksi WIP, menyimpan draft, berpindah ke Pengeluaran, lalu kembali ke Produksi WIP. Draft dan jumlah yang sudah dimasukkan harus tetap tersedia; berpindah form tidak boleh mengganti draft jenis form lain.

## 2. Perilaku yang disengaja

- Draft disimpan terpisah per jenis form: Stock Awal, Pengeluaran, Barang Masuk, Produksi WIP, Sales, dan Stock Opname.
- Saat pindah form, form yang sedang terbuka disimpan lokal terlebih dahulu. Form tujuan memulihkan draftnya sendiri bila tersedia; jika belum ada, form baru dibuka.
- Setelah transaksi berhasil disimpan ke database, hanya draft jenis itu yang dihapus. Draft jenis form lain tetap tersedia.
- Tombol Simpan Draft tetap menyimpan lokal dan tidak mengubah stok. Transaksi hanya diproses melalui Simpan Transaksi setelah konfirmasi.

## 3. Batas keamanan dan data

- Draft tetap terpisah menurut akun, workspace/outlet, dan divisi melalui key lokal yang sudah ada.
- Nama key `stock-opname:draft:v1:<user>:<workspace>:<division>` tidak berubah; data draft lama berbentuk satu objek tetap dapat dibaca dan diubah menjadi format beberapa draft saat disimpan berikutnya.
- Tidak mengubah key `waitlist_frontend_demo_v1`, Supabase, tabel, RPC, RLS, autentikasi, transaksi, atau aturan akses.
- Draft berada di perangkat/browser yang sama; tidak disinkronkan ke perangkat lain.

## 4. Implementasi

| File | Perubahan |
| --- | --- |
| `assets/js/stock-opname-service.js` | Membaca draft legacy atau kumpulan draft per form dalam key lama; menyimpan, memuat berdasarkan jenis form, dan menghapus satu jenis tanpa menghapus draft lain. |
| `assets/js/stock-opname-ui.js` | Menyimpan form yang ditinggalkan sebelum pindah; memulihkan draft tujuan; menghapus hanya draft form yang sukses diproses. |
| `docs/stock-opname/implementation.md` | Menautkan catatan perubahan dan status rollout. |

## 5. Batas yang diketahui dan risiko untuk dicek

- Satu draft per jenis form per akun/outlet/divisi; membuka transaksi lama yang diedit dapat meminta konfirmasi sebelum mengganti draft jenis yang sama.
- Penghapusan data situs/browser atau pindah perangkat tetap menghilangkan akses ke draft lokal.
- Perlu cek langsung alur Produksi WIP `2` → Pengeluaran → Produksi WIP dan pastikan angka `2` pulih; juga periksa beberapa jenis draft, reload halaman, dan isolasi antar akun/divisi pada browser yang sama.

## 6. Status verifikasi dan penerapan

- PR [#230](https://github.com/ahmadpajarpirmansah099-droid/New-Project/pull/230) terbuka dan mergeable; commit implementasi `8d1562dfea5d891bf3568a135167a97a2a46f0d4`. Belum merged dan belum live.
- Tes otomatis dan uji akun admin Bar belum dijalankan untuk perubahan ini.
- Perubahan hanya frontend; tidak ada migration database. Merge dan deploy perlu dicatat setelah GitHub mengonfirmasinya.

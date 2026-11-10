# Stock Opname — picker bergaya web

## Tujuan dan perilaku yang diminta

Popup pemilih tanggal dan satuan pada Android tampil dengan tema gelap sistem, berbeda dari halaman web. Pemilihan tanggal dan pilihan daftar sekarang memakai dialog di dalam aplikasi dengan palet, bentuk kontrol, tipografi, dan bayangan New-Project.

## Perilaku dan batas data

- Kalender dimulai pada tanggal yang tersimpan. Admin dapat berpindah bulan, memilih tanggal, lalu menekan Gunakan tanggal atau Batal.
- Sales tetap punya tanggal awal dan tanggal akhir yang terpisah.
- Kategori, tujuan Move, padanan barang Move, dan satuan memakai daftar pilihan di dalam dialog web.
- Tanggal tetap disimpan sebagai `YYYY-MM-DD`; satuan, kategori, tujuan, dan mapping menggunakan nilai yang sama seperti sebelumnya.
- Seluruh input angka, transaksi, draft, konversi, dan perhitungan stok tetap menggunakan alur lama.
- Tidak mengganti ikon sistem: chevron dan status pilihan memakai elemen CSS/teks; tidak ada dependency baru.

## Batas keamanan

- Tidak ada perubahan Supabase, schema, RLS/RPC, autentikasi, otorisasi, key penyimpanan, atau payload transaksi.
- Daftar tujuan tetap berasal dari katalog tujuan aktif dan mapping tetap difilter menurut satuan dasar yang sama.
- Isi nama/label tetap di-escape sebelum dimasukkan ke markup. Dialog ditutup melalui Batal, tombol Tutup, Escape, atau klik backdrop.

## File yang berubah

| File | Perubahan |
| --- | --- |
| `assets/js/stock-opname-ui.js` | Dialog web untuk kalender dan pilihan form; tidak lagi merender `input type=date` atau `select` native pada form Stock Opname. |
| `assets/css/stock-opname.css` | Gaya dialog pilihan, kalender, daftar, dan pemicu sesuai token web app serta layout responsif. |
| `tests/stock-opname-ui.test.js` | Memastikan form Stock Opname merender kontrol web dan tidak mengandung pemilih tanggal/daftar native. |
| `docs/stock-opname/implementation.md` | Menautkan catatan implementasi ini. |

## Verifikasi, keterbatasan, dan rollout

- `node --check assets/js/stock-opname-ui.js` lulus; `node --test tests/*.test.js` lulus 80/80; `git diff --check` lulus.
- Tes memastikan struktur kontrol, bukan interaksi visual browser Android. Perlu cek setelah deploy pada HP: pilih tanggal, batalkan, ganti bulan, pilih satuan, kategori, serta tujuan/mapping Move.
- Belum merged atau live saat catatan ini dibuat. Tidak ada migration database.

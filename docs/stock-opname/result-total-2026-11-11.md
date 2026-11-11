# Total selisih rupiah pada hasil opname

## Perilaku yang disengaja

Di bagian paling bawah rincian setiap hasil opname, tampil jumlah bersih selisih rupiah seluruh barang: nilai positif dikurangi nilai negatif. Angka per barang dan rincian yang dapat dibuka tetap sama. Total hanya tampil jika hasil opname periode tersebut tersimpan; saat hasil lama dibatalkan untuk isi ulang Stock Awal, total muncul lagi setelah opname diselesaikan ulang.

## Batas keamanan dan implementasi

Frontend menjumlahkan `variance_value` dari snapshot `result` periode yang sedang ditampilkan. Tidak membaca periode lain untuk total tersebut. Perubahan ada pada `assets/js/stock-opname-ui.js` dan `assets/css/stock-opname.css`, dengan tes di `tests/stock-opname-ui.test.js`. Tidak ada perubahan database, RLS, RPC, autentikasi, hak akses, localStorage, atau transaksi.

## Keterbatasan, risiko, dan verifikasi

Total mengikuti nilai selisih rupiah yang sudah tersimpan per barang. Bila harga master atau resep lama salah, koreksi opname perlu dilakukan melalui alur yang berlaku; tampilan tidak menghitung ulang snapshot. Tes nilai positif, negatif, dan nol lulus; 84 tes lokal lulus. Pemeriksaan visual Android asli belum dilakukan.

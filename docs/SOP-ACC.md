# SOP ACC perubahan

## Alur

1. **Ujang** mengerjakan hanya scope yang disetujui, memeriksa dampak ke pemanggil dan data, menjalankan tes relevan, lalu menyerahkan perubahan, hasil tes, dan risiko. Jangan merapikan di luar scope tanpa izin.
2. **Dadang** mereview perubahan dan kode terkait secara read-only. Pisahkan temuan **terverifikasi** (dengan bukti/skenario) dari area **belum diuji atau belum terverifikasi**; sampaikan temuan dan batas pemeriksaan ke ASEP. Dadang tidak memberi ACC.
3. **ASEP** memeriksa secara independen hasil kerja dan review Dadang, lalu menyatakan **ACC** atau **revisi/tunda ACC** beserta alasan dan hal yang perlu dituntaskan. Jika revisi, ulangi pemeriksaan pada perubahan yang diperbaiki.

## Syarat keputusan ASEP

- **Blokir ACC** jika ada bug kritis, celah akses, celah keamanan nyata (misalnya kebocoran rahasia), tes relevan yang belum dijalankan, atau temuan Dadang bertanda “sebaiknya diperbaiki” yang belum selesai.
- Tes baru **tidak wajib** untuk setiap perubahan logika: tes yang sudah ada cukup bila relevan. Logika berisiko wajib punya tes yang memadai.
- Perubahan database wajib disertai **tes SQL yang dijalankan** dan **rencana rollback**.
- Pemeriksaan browser desktop **dan** ponsel tidak wajib selalu keduanya untuk perubahan UI; laporkan cakupan yang benar-benar diperiksa.
- Perubahan backward-compatible boleh diuji tanpa data produksi bila data uji representatif dan risikonya dijelaskan. Jangan menyebut sesuatu terverifikasi jika belum diuji.

**ACC berarti siap merge/deploy, bukan izin otomatis untuk commit, push, merge, atau deploy.** Setelah ACC, ASEP hanya melakukan commit/push bila pengguna memberi izin eksplisit; push, merge, dan deploy masing-masing memerlukan izin eksplisit pengguna sebelum dilakukan. Tanpa ACC atau izin tersebut, berhenti pada laporan hasil/revisi.

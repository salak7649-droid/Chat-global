# Massage Global

Starter aplikasi chat global real-time dengan akun pengguna, ruang publik, dan pesan pribadi. Ini adalah MVP fondasi—belum mencakup panggilan, status, enkripsi end-to-end, atau pengiriman media.

## Menjalankan secara lokal

1. Pasang Node.js 20 atau lebih baru.
2. Salin `.env.example` menjadi `.env`.
3. Ganti `SESSION_SECRET` dengan nilai acak yang panjang dan ubah `OWNER_PASSWORD` menjadi kata sandi kuat. Nama akun owner awal adalah `ikky00`.
4. Jalankan `npm install`, lalu `npm start`.
5. Buka `http://localhost:3000`.

Akun owner dibuat otomatis saat server pertama kali dijalankan. Kata sandi disimpan sebagai hash bcrypt di database SQLite lokal (`data/chat.db`), bukan di source code. Jangan gunakan `ikky00` sebagai kata sandi pada server publik. Jangan commit `.env` atau database.

## Fitur MVP

- Daftar akun dan masuk/keluar dengan sesi cookie HTTP-only.
- Ruang obrolan global real-time.
- Pesan pribadi real-time antar pengguna.
- Riwayat pesan disimpan di SQLite.
- Daftar pengguna aktif dan status online.
- Panel owner dasar dan pembatasan laju endpoint autentikasi.

Untuk deployment publik, gunakan HTTPS, rahasia kuat, backup database, kebijakan privasi, moderasi/laporan pengguna, dan layanan session store yang sesuai skala. Pesan saat ini disimpan di server dan **tidak** dienkripsi end-to-end.

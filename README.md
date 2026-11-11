# Chat Global

Aplikasi chat real-time dengan backend Node.js/Express dan klien web. Flutter mobile shell tersedia di root; klien mobile membuka instalasi web yang di-host oleh backend.

## Menjalankan backend/web

1. Pasang Node.js 20 atau lebih baru.
2. Salin `.env.example` menjadi `.env`, lalu tetapkan `SESSION_SECRET` dan `OWNER_PASSWORD` yang kuat. Jangan commit `.env` atau rahasia.
3. Jalankan `npm install` lalu `npm start`.
4. Buka `http://localhost:3000` di browser. Untuk akses publik, deploy di domain HTTPS dan gunakan penyimpanan persisten untuk SQLite serta uploads.

## Flutter mobile

Aplikasi Flutter memuat web client dari server yang kamu deploy; ia bukan konversi UI web ke widget Dart. URL server dapat dimasukkan di aplikasi, atau diberikan saat build:

```sh
flutter create --platforms=android,ios .
flutter pub get
flutter run --dart-define=CHAT_SERVER_URL=https://domain-server-kamu
```

Untuk Android emulator, server lokal komputer host biasanya dapat diakses melalui `http://10.0.2.2:3000` (hanya untuk pengembangan). Di perangkat fisik, gunakan alamat LAN komputer atau server HTTPS yang dapat dijangkau perangkat.

Fitur chat yang sudah tersedia pada web client bekerja melalui server yang sama. Media upload dan panggilan suara/video memerlukan backend/frontend yang mendukungnya, HTTPS pada deployment publik, izin kamera/mikrofon native, dan pengujian pada perangkat target. WebView wrapper ini belum menambahkan handler izin native khusus untuk kamera/mikrofon; jangan anggap panggilan sudah siap produksi sebelum pengujian tersebut.

## Catatan deployment

Gunakan HTTPS, kredensial kuat, backup database, kebijakan privasi dan moderasi, serta hosting yang mendukung WebSocket dan penyimpanan persisten. Jangan pernah menyimpan `.env`, kata sandi, atau secret di repository.

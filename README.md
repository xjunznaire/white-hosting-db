# White Hosting ID — Cloudflare Pages Auto-Delivery Store

Project toko digital `toko.whtstore.my.id` menggunakan Cloudflare Pages + Pages Functions + D1. Tidak membutuhkan VPS, Node server, terminal, atau server tambahan. Source diedit melalui GitHub dan deploy otomatis dari GitHub ke Cloudflare Pages.

## Fitur

- Etalase responsif, pencarian produk, keranjang, checkout satu produk per pesanan.
- Invoice QRIS dinamis melalui APIQris.
- Webhook pembayaran bertanda tangan HMAC SHA-256; status lunas hanya ditetapkan oleh webhook terverifikasi.
- **Auto-delivery dari database:** admin memasukkan stok digital satu item per baris; setelah pembayaran terverifikasi, sistem mengubah item yang direservasi menjadi terkirim.
- Pelanggan melihat dan menyalin kode/akun/license/link di halaman status pesanan setelah pembayaran lunas.
- Reservasi stok ketika checkout agar dua invoice aktif tidak memakai item digital yang sama.
- Stok yang dicadangkan dilepas kembali saat invoice expired/cancelled atau pembuatan invoice gagal.
- Jika stok tidak cukup pada saat pengiriman, status pesanan menjadi `partial` atau `awaiting_stock`; admin dapat menambah stok dan menekan **Coba kirim**.
- Panel admin: login, ringkasan order, produk, harga, aktif/nonaktif, input stok massal, hapus item stok tersedia, dan retry pengiriman.
- Data produk, stok, order, admin, sesi dan item terkirim disimpan di Cloudflare D1.
- API key dan webhook secret hanya disimpan sebagai Cloudflare Secrets, tidak dikirim ke browser.

## Format item stok digital

Di Admin → Produk → **Stok**, masukkan satu item per baris. Setiap baris dianggap satu unit yang bisa dikirim satu kali. Contoh:

```text
LICENSE-AAAA-BBBB-CCCC
username:password
https://example.com/private-download
Akun: user123 | Password: rahasia | Catatan: server SG
```

Gunakan format teks sederhana. Untuk URL file, pastikan link memang aman dibagikan kepada pembeli. Jangan memasukkan password akun pribadi, kredensial API merchant, atau data sensitif yang tidak seharusnya diserahkan ke pelanggan. Data stok disimpan sebagai teks di D1 dan ditampilkan kepada pelanggan pemilik nomor pesanan setelah pembayaran terverifikasi.

## Penting sebelum live

1. Daftar/login APIQris, unggah QRIS merchant sendiri, pasangkan aplikasi Android APIQris Pendamping, lalu ambil API key dan webhook secret dari dashboard.
2. Isi `APIQRIS_KEY` dan `APIQRIS_WEBHOOK_SECRET` sebagai **Cloudflare Pages Secrets**.
3. Isi variable `SITE_URL` dengan `https://toko.whtstore.my.id`.
4. Daftarkan webhook URL `https://toko.whtstore.my.id/api/webhook/qris` pada APIQris.
5. Uji dengan API key/test mode dan item stok uji sebelum menerima pembayaran live.
6. Cocokkan algoritma/format signature HMAC dengan dokumentasi APIQris terbaru. Implementasi saat ini mengasumsikan header `X-APIQris-Signature: t=...,v1=...` dan pesan tanda tangan `${timestamp}.${rawBody}`.
7. Cocokkan nama field respons invoice dengan adapter `functions/api/checkout.js` (saat ini mengharapkan `id`, `total_amount`, `qr_image_url`, `expires_at`).

Dokumentasi APIQris: https://apiqris.com/dokumentasi

## Deploy tanpa terminal

### A. Upload source ke GitHub

1. Unduh ZIP project, ekstrak di komputer.
2. Buka repository GitHub yang sudah terhubung ke Cloudflare Pages.
3. Pilih **Add file → Upload files**.
4. Upload seluruh isi folder project dan izinkan replace file lama.
5. Commit changes. Cloudflare Pages akan deploy ulang otomatis.
6. Pastikan `public/`, `functions/`, `migrations/`, `wrangler.toml`, dan `README.md` berada di root repository.

Jika membuat repository baru: GitHub → New repository → beri nama `white-hosting-id`, lalu upload isi folder project.

### B. Konfigurasi Cloudflare Pages

1. Cloudflare Dashboard → Workers & Pages → project Pages.
2. Framework preset: **None**.
3. Build command: kosong (atau `exit 0` bila dashboard mewajibkan perintah).
4. Build output directory: `public`.
5. Pages Functions dikenali dari folder `functions/`.

Git integration direkomendasikan. Direct Upload biasa tidak menjalankan Pages Functions.

### C. Buat / hubungkan D1

1. Cloudflare Dashboard → Workers & Pages → D1 SQL Database.
2. Buat database `white-hosting-db` jika belum ada.
3. Jika database baru: buka SQL Console, jalankan seluruh isi `migrations/0001_init.sql`, lalu jalankan seluruh isi `migrations/0002_database_delivery.sql`.
4. Jika database lama sudah menjalankan `0001_init.sql`: **jalankan hanya `0002_database_delivery.sql`**. Jangan jalankan ulang migration 0001 karena tabel lama sudah ada.
5. Pages project → Settings → Functions → D1 database bindings → Add binding:
   - Variable name: `DB`
   - D1 database: `white-hosting-db`
6. Save, lalu redeploy project.

### D. Tambahkan secrets dan variables

Pages project → Settings → Variables and Secrets:

- `APIQRIS_KEY` — Secret, API key APIQris.
- `APIQRIS_WEBHOOK_SECRET` — Secret, webhook secret APIQris.
- `SITE_URL` — Text: `https://toko.whtstore.my.id`.
- `STORE_NAME` — Text: `White Hosting ID` (opsional).

Atur pada Production. Jangan menaruh key di GitHub atau file frontend.

### E. Hubungkan domain

1. Pages project → Custom domains → Set up a custom domain.
2. Masukkan `toko.whtstore.my.id`.
3. Ikuti instruksi DNS Cloudflare sampai status domain Active dan HTTPS aktif.

### F. Buat admin pertama

1. Buka `https://toko.whtstore.my.id/admin`.
2. Buat admin pertama dengan username 3–32 karakter (huruf kecil, angka, underscore atau strip) dan password 4–64 karakter (huruf kecil dan angka saja).
3. Setup awal hanya tersedia jika tabel admins masih kosong.
4. Login untuk menambah produk dan stok.

## Cara menggunakan auto-delivery

1. Login ke `/admin`.
2. Tambah produk digital (nama, kategori, deskripsi, harga, gambar opsional).
3. Klik tombol **Stok** pada produk.
4. Masukkan kode/akun/license/link; satu item per baris; klik **Simpan item stok**.
5. Stok di etalase dihitung dari jumlah item database berstatus tersedia. Angka stok manual tidak dipakai.
6. Pembeli checkout dan menyelesaikan QRIS.
7. Webhook valid mengubah status pembayaran menjadi lunas dan sistem mengirim item yang telah direservasi saat checkout.
8. Pembeli melihat hasil di URL order tracker. Admin dapat menekan **Coba kirim** untuk pesanan lunas yang belum lengkap setelah stok ditambahkan.

## URL

- Toko: `https://toko.whtstore.my.id`
- Admin: `https://toko.whtstore.my.id/admin`
- Order tracker: `https://toko.whtstore.my.id/order.html?id=ID_ORDER`
- Webhook: `https://toko.whtstore.my.id/api/webhook/qris`

## Catatan keamanan dan operasional

- Item digital disimpan sebagai teks biasa di D1; jangan simpan data rahasia yang tidak dimaksudkan untuk pelanggan. Batasi akses admin dan aktifkan Cloudflare WAF/rate limiting.
- Halaman order memakai ID acak panjang sebagai akses order; pelanggan harus menyimpan URL/ID order dan tidak membagikannya.
- Pengiriman idempoten: item yang sudah dikirim tidak dapat diklaim ulang. Stok direservasi saat checkout dan dilepas pada callback expired/cancelled.
- Jika provider tidak mengirim callback expired/cancelled, reservasi bisa tertahan. Periksa dashboard APIQris dan tambahkan mekanisme rekonsiliasi/cleanup sebelum skala besar.
- Jika pembayaran terkonfirmasi ketika stok sudah tidak tersedia (misalnya data stok diubah manual di D1), status delivery menjadi `awaiting_stock`; admin harus menambah stok dan retry atau menangani refund secara manual.
- Belum ada email/WhatsApp delivery, refund otomatis, voucher, atau multi-admin.
- Verifier webhook wajib disesuaikan dan diuji terhadap dokumentasi APIQris terkini sebelum live. Jangan menganggap integrasi live sudah tervalidasi hanya karena website berhasil deploy.

## Struktur

- `public/` — halaman toko, admin, order tracker, CSS dan JS.
- `functions/api/` — Pages Functions API, checkout, admin, order, webhook.
- `functions/api/_delivery.js` — reservasi stok dan auto-delivery.
- `migrations/0001_init.sql` — skema dasar.
- `migrations/0002_database_delivery.sql` — skema inventori digital dan status delivery.
- `wrangler.toml` — konfigurasi Cloudflare Pages/D1.


## Perubahan versi username admin

- Form admin sekarang menggunakan **username**, bukan Gmail/email.
- Username: 3–32 karakter, huruf kecil, angka, `_` atau `-`.
- Password: 4–64 karakter, huruf kecil dan angka (`a-z`, `0-9`).
- Untuk kompatibilitas database lama, username disimpan pada kolom `admins.email` yang sudah ada. Tidak perlu migration tambahan.
- Jika halaman menampilkan `Unexpected token '<'`, artinya browser menerima HTML (biasanya halaman 404/error Cloudflare) dari endpoint `/api/auth`. Pastikan folder `functions/` ada sejajar dengan `public/` di root repository, Pages terhubung melalui Git integration (bukan Direct Upload), Build output directory `public`, binding D1 bernama `DB`, lalu lakukan retry deployment. Kode frontend terbaru akan menampilkan petunjuk ini alih-alih error JSON mentah.


## Bahasa dan tema tampilan

- Tombol **ID / EN** tersedia pada halaman toko, admin, dan status pesanan.
- Bahasa awal adalah Bahasa Indonesia (`id`); pilihan terakhir disimpan di browser.
- Tombol **Mode gelap / Mode terang** mengubah tema hitam/putih dan pilihan terakhir disimpan di browser.
- Tidak memerlukan migration atau environment variable baru.


## Perbaikan HTTP 500 saat membuat admin

Build ini menambahkan pemeriksaan binding D1 dan pesan error JSON yang lebih informatif pada endpoint `POST /api/auth`. Setelah upload dan deploy, jika masih gagal, pesan akan menyebutkan apakah binding `DB` tidak ada atau tabel/kolom migration belum sesuai.

Periksa Cloudflare Pages > Settings > Bindings:
- D1 database binding variable name harus persis `DB`.
- Binding harus dipasang pada Production (dan Preview jika menguji Preview deployment).
- Setelah menambahkan/mengubah binding, lakukan redeploy.

Periksa D1 SQL Console:
```sql
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('admins','sessions');
PRAGMA table_info(admins);
```
Tabel `admins` harus memiliki kolom `id`, `email`, `password_hash`, `password_salt`. Jika tabel belum ada, jalankan `migrations/0001_init.sql` satu kali pada database yang benar. Jangan drop database atau menghapus tabel lama.

Buka `https://DOMAIN-ANDA/api/auth` untuk memeriksa endpoint GET. Jika hasilnya bukan JSON, Pages Functions belum ter-deploy/route belum aktif. Jika GET JSON tetapi POST gagal, baca pesan error JSON dan Cloudflare Dashboard > Workers & Pages > project > Functions > Logs.


### Perbaikan PBKDF2 Cloudflare Workers

Fungsi hash password menggunakan PBKDF2-SHA-256 dengan 100.000 iterasi agar sesuai batas Web Crypto pada runtime Cloudflare Workers. Nilai ini dipakai konsisten untuk pembuatan admin dan verifikasi login.

# Backend Mateha (CodeIgniter 4 + MySQL)

Backend ini menggantikan Firebase (Firestore + Firebase Auth) dan server Node lama (`server.ts`).
Tampilan React di folder utama tetap sama; semua data kini lewat API di `/api` dan disimpan di MySQL.

## Kebutuhan

- PHP **8.2+** dengan ekstensi `intl`, `mbstring`, `mysqli`, `curl`, `json`
- MySQL 5.7+ / MariaDB 10.4+
- Composer
- Node.js 20+ (hanya untuk mem-build tampilan)

## Menjalankan di komputer sendiri

```bash
# 1. Backend
cd backend
composer install
cp env .env                 # lalu isi bagian database & GEMINI_API_KEY (lihat di bawah)
php spark migrate           # membuat semua tabel
php spark mateha:create-user dhifa --role admin --name "Dhifa Aksa Hermawan"
php spark serve             # API di http://localhost:8080

# 2. Tampilan (terminal lain, di folder utama)
npm install
npm run dev                 # buka http://localhost:3000 (request /api diteruskan ke port 8080)
```

Isi minimal `backend/.env`:

```ini
CI_ENVIRONMENT = development
app.baseURL = 'http://localhost:8080/'

database.default.hostname = 127.0.0.1
database.default.database = mateha
database.default.username = root
database.default.password =
database.default.DBDriver = MySQLi
database.default.charset = utf8mb4
database.default.DBCollat = utf8mb4_unicode_ci

GEMINI_API_KEY =    # opsional; lebih mudah diisi dari dashboard admin
```

**API key Gemini** paling mudah diatur dari aplikasi: login sebagai admin → *Dashboard & Data* →
kartu **Pengaturan AI (Gemini)** → tempel key → *Tes Koneksi* → *Simpan Key*. Key dari dashboard dipakai lebih
dulu; jika dikosongkan, sistem memakai `GEMINI_API_KEY` di `.env`.

## Asisten AI

Di *Dashboard & Data* ada kartu **Asisten AI**. Lewat chat, AI menyusun draf **event, invoice, quotation, atau
kwitansi**, contohnya:

- "tgl 23 oktober ada event Bagimu Negeri di Mercure Lengkong, 3 kamera streaming dan 1 VJ, matador 2"
- "buatkan invoice DP 50% untuk event Bagimu Negeri"
- "buat kwitansi pelunasan untuk invoice INV/MATEHA/2026/10/002"
- 📎 lampirkan foto/screenshot/PDF invoice lalu tulis "ini invoice event AHM Inter, buatkan RAB eventnya"
  (maks. 3 file per pesan; gambar otomatis diperkecil di browser)

AI memakai data yang ada (klien, event, invoice, riwayat harga). Draf bisa dikoreksi lewat chat, lalu klik
**Buat …**; dokumen dibuat dengan penomoran & default yang sama seperti form manual. Tidak ada yang tersimpan
sebelum dikonfirmasi. Percakapan tersimpan di browser.

**Memori AI**: aturan kerja yang diajarkan admin ("kedepannya kalau ada live streaming, selalu tambahkan 1 operator
zoom") disimpan di tabel `ai_memories` dan selalu dipakai AI. Kelola lewat tombol **Memori AI** (tambah, edit,
nonaktifkan, hapus) atau minta AI "lupakan aturan …".

Endpoint: `POST /api/ai/assistant`, `GET/POST /api/ai/memories`, `PATCH/DELETE /api/ai/memories/{id}`.

## Pindah data dari Firestore

1. **Sebelum** beralih, buka aplikasi versi lama (Firebase) sebagai admin → *Dashboard & Data* →
   **Download Full Database (.JSON)**.
2. Jalankan:

   ```bash
   php spark mateha:import-backup /lokasi/mateha_full_backup_YYYY-MM-DD.json
   ```

   - Data yang sudah ada dilewati; tambahkan `--overwrite` untuk menimpanya.
   - Password anggota yang tersimpan di backup langsung di-*hash*, jadi staf bisa login dengan password yang sama.
   - Akun tanpa password akan dilaporkan; atur dengan `php spark mateha:create-user <username>`.
   - Backup versi lama **tidak berisi data Keuangan Mateha** (`settings/mateha_finance`). Versi baru sudah
     menyertakannya di file backup.

## Deploy ke hosting

1. Build tampilan dan salin ke backend:

   ```bash
   npm run build:backend     # hasil build masuk ke backend/public (app.html + assets/)
   ```

2. Upload folder `backend/` (termasuk `vendor/` dari `composer install --no-dev`) ke server.
3. Arahkan **document root** domain ke `backend/public`.
   - cPanel: *Domains* → pilih domain → ubah *Document Root* ke `.../backend/public`.
   - Jika document root tidak bisa diubah, upload isi `backend/public` ke `public_html`, folder lainnya ke luar
     `public_html`, lalu sesuaikan path di `public_html/index.php` (`$pathsConfig`).
4. Buat `.env` di server (set `CI_ENVIRONMENT = production`, `app.baseURL = 'https://domain-anda/'`, kredensial
   database), lalu jalankan `php spark migrate`. API key Gemini bisa diisi setelahnya dari dashboard admin.
5. Pastikan folder `writable/` bisa ditulis web server.

API dan tampilan berjalan di domain yang sama, jadi tidak perlu pengaturan CORS. Jika tampilan di-host di domain
lain, isi `CORS_ALLOWED_ORIGINS` di `.env` dan set `VITE_API_BASE_URL` saat build.

## Perintah

| Perintah | Fungsi |
|---|---|
| `php spark migrate` | Membuat/memperbarui tabel |
| `php spark mateha:create-user <username> [--role admin\|finance\|staff] [--name "Nama"] [--password ...]` | Membuat akun atau me-reset password |
| `php spark mateha:import-backup <file.json> [--overwrite]` | Impor backup JSON dari versi Firestore |

## Struktur & keamanan

- Setiap koleksi lama = satu tabel (`projects`, `users`, `invoices`, `quotations`, `kwitansi`, `clients`, `banks`,
  `payslips`, `kasbon_requests`, `settings`, `shared_payslips`). Isi dokumen di kolom `data` (JSON); field yang
  dipakai untuk query punya kolom ber-index tersendiri.
- Login memakai token acak (hanya *hash*-nya yang disimpan di `auth_tokens`), berlaku 30 hari; percobaan login
  dibatasi per IP.
- Password hanya disimpan sebagai *hash* (`password_hash`) dan tidak pernah dikirim ke browser.
- API key Gemini disimpan di tabel `app_secrets` yang tidak bisa diakses lewat API data; hanya admin yang bisa
  mengubahnya dan browser hanya menerima versi tersamar (mis. `AIza…x9Qk`).
- Aturan akses ada di `app/Libraries/Policy.php` (porting dari `firestore.rules`) dengan perbaikan:
  staf tidak bisa mengubah peran sendiri, profil anggota lain hanya menampilkan nama/peran, dan tamu di link
  berbagi hanya bisa menambah pengeluaran Point B.
- Fitur "live" (mis. halaman kolaborasi) diperbarui otomatis tiap ±5 detik (polling).

## Pemecahan masalah

| Gejala | Penyebab & solusi |
|---|---|
| Terminal Vite menampilkan `http proxy error ... ECONNREFUSED`, atau aplikasi menampilkan "Server backend tidak berjalan" | Backend belum jalan. Buka terminal kedua: `cd backend` lalu `php spark serve`, dan biarkan tetap terbuka. Aplikasi butuh dua terminal: `php spark serve` (port 8080) dan `npm run dev` (port 3000). |
| "Tabel pengaturan belum ada di database" | Jalankan `php spark migrate` di folder `backend` (wajib setiap kali pull versi baru). |
| Tes Koneksi Gemini: "PHP di server tidak bisa memverifikasi sertifikat SSL Google" (umum di XAMPP/Laragon Windows) | Unduh <https://curl.se/ca/cacert.pem>, simpan mis. di `C:\php\cacert.pem`, lalu di `php.ini` isi `curl.cainfo = "C:\php\cacert.pem"` dan `openssl.cafile = "C:\php\cacert.pem"`. Restart `php spark serve`. Cek lokasi php.ini dengan `php --ini`. |
| Tes Koneksi: "API key ditolak oleh Google" | Key salah/terhapus atau Gemini API belum aktif untuk project-nya. Buat key baru di Google AI Studio. |
| Backend jalan di port lain | Buat file `.env.local` di folder utama berisi `BACKEND_URL="http://localhost:PORT"`, lalu restart `npm run dev`. |

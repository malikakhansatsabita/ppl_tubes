# Backend PLATIFUL

Backend memakai Node.js bawaan tanpa framework tambahan. `server.js` memulai HTTP server, menyajikan file dari `Front end`, dan meneruskan API ke modul auth/route.

## File

- `server.js`: entry point HTTP, parser JSON request, static file server, dan router API.
- `create-admin.js`: membuat admin pertama dari environment variables lokal; admin tidak dapat didaftarkan dari form publik.
- `test.js`: tes integrasi dengan server sementara dan penyimpanan JSON terisolasi.
- `storage.js`: adapter PostgreSQL (Render), MySQL lokal, dan JSON sementara khusus mode tes.
- `product-pricing.js`: validasi jadwal diskon, harga efektif saat ini, dan kedaluwarsa produk.
- `auth.js`: pendaftaran, login, hash password, cookie sesi, pemeriksaan sesi, dan logout.
- `routes/account.js`: ringkasan dashboard, lokasi gerai, favorit, profil akun/gerai, dan perubahan password.
- `routes/products.js`: katalog produk, validasi listing, laporan produk, serta perubahan produk milik retailer.
- `routes/orders.js`: pembuatan pesanan, pembatasan akses berdasarkan pemilik, pembatalan, stok, dan validasi pickup.
- `routes/admin.js`: dashboard platform, suspend akun, moderasi laporan, publikasi artikel, tarif komisi, dan catatan settlement.
- `routes/extra.js`: penghapusan akun beserta pembersihan data terkait, notifikasi, verifikasi, kategori, template tervalidasi, laporan, ulasan, pengumuman, laporan bulanan retailer, dan filter tersimpan.
- `data/products.json`: listing produk.
- `data/orders.json`: pesanan yang dibuat customer.
- `data/users.json`: profil akun dan hash password.
- `data/sessions.json`: hash token sesi dan waktu kedaluwarsa.
- `data/reports.json`: laporan produk dari customer.
- `data/articles.json`: artikel edukasi draft dan terbit.
- `data/commission.json`: tarif komisi platform.
- `data/settlements.json`: catatan settlement retailer.
- `package.json`: metadata package dan perintah `npm start`.

## Menjalankan

Dari folder ini jalankan `npm start`. Port default adalah `3000`; port dapat diganti dengan environment variable `PORT`. Atur `DATABASE_URL` untuk PostgreSQL atau `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, dan `DB_NAME` untuk MySQL. Jalankan `npm test` untuk tes integrasi alur customer/retailer/admin, validasi listing dan template, harga, pickup/no-show, notifikasi, jam operasional, ulasan publik, artikel draft/published, laporan, filter, dan ekspor. Test menggunakan `PLATIFUL_TEST_MODE=1` dan data JSON sementara.

Harga promo bertahap dihitung saat katalog dibaca dan saat checkout tanpa mengubah harga dasar listing. Produk kedaluwarsa tidak ditampilkan atau dipesan, dan no-show hanya dapat dicatat setelah batas waktu pickup. Laporan retailer disimpan per bulan (format `YYYY-MM`) dan hanya menghitung pesanan pada bulan tersebut; stok dan listing aktif dicatat saat laporan dibuat. Penghapusan akun menghapus sesi dan data milik akun, serta menganonimkan referensi pada riwayat transaksi dan ulasan.

Admin pertama dibuat lewat `npm run create-admin`, tidak melalui pendaftaran publik. Isi `PLATIFUL_ADMIN_EMAIL`, `PLATIFUL_ADMIN_NAME`, dan `PLATIFUL_ADMIN_PASSWORD` (minimal 12 karakter) pada environment layanan atau terminal. Hapus variabel password setelah selesai. Jangan simpan password di source control atau kirim melalui chat.

Untuk deploy Render, gunakan Blueprint pada `render.yaml` dari repository GitHub. Blueprint membuat PostgreSQL dan mematikan impor data JSON lokal agar data development tidak dipublikasikan. Lihat bagian deploy di README utama; database Render memerlukan biaya berlangganan sesuai harga yang ditampilkan Render.

Pembayaran aktif hanya cash saat pickup. Integrasi pembayaran online dan pengiriman email membutuhkan kredensial provider dan belum diaktifkan.

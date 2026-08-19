# PresensiHub — Sistem Absensi Online

PresensiHub adalah aplikasi web untuk membantu perusahaan mengelola kehadiran pegawai secara digital.

## ✨ Fitur

* 👤 Login Admin dan Pegawai
* 📋 Rekap presensi pegawai
* ⏰ Status tepat waktu dan terlambat
* 📍 Presensi dengan koordinat GPS
* 📸 Foto/selfie saat presensi
* 🏖️ Pengajuan izin dan cuti
* 👥 Manajemen data pegawai
* ⚙️ Pengaturan jam kerja dan kantor
* 📊 Export laporan ke Excel
* 🖨️ Cetak laporan PDF
* 📱 Tampilan responsif untuk desktop dan mobile

## 🛠️ Teknologi

* HTML5
* CSS3
* JavaScript
* Node.js
* Express.js
* SQLite
* JWT
* bcrypt
* Multer
* XLSX

## 📁 Struktur Project

```text
absensi-app/
├── public/
│   ├── css/
│   ├── js/
│   ├── uploads/
│   ├── admin.html
│   ├── dashboard.html
│   └── index.html
├── database.js
├── server.js
├── package.json
├── package-lock.json
└── README.md
```

## 🚀 Menjalankan Project

Clone repository:

```bash
git clone https://github.com/muheca/presensihub.git
cd presensihub
```

Install dependencies:

```bash
npm install
```

Jalankan aplikasi:

```bash
npm start
```

Kemudian buka:

```text
http://localhost:3000
```

## 🔐 Catatan Keamanan

Database lokal, file environment, dan file upload pengguna tidak disimpan di repository GitHub.

File berikut diabaikan oleh Git:

```text
node_modules/
absensi.db
.env
public/uploads/*
```

## 🎯 Tujuan Project

Project ini dibuat sebagai portfolio untuk menunjukkan kemampuan dalam membangun aplikasi web full-stack, mulai dari pembuatan antarmuka, REST API, autentikasi, database, upload file, hingga pembuatan laporan.

## 👨‍💻 Developer

**Muheca**

GitHub: https://github.com/muheca

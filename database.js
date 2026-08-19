const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'absensi.db');
const db = new DatabaseSync(dbPath);

// Create required upload directories
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Inisialisasi Tabel
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nip TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'pegawai',
      position TEXT DEFAULT 'Staff',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      check_in_time TEXT,
      check_out_time TEXT,
      check_in_photo TEXT,
      check_out_photo TEXT,
      check_in_lat REAL,
      check_in_lng REAL,
      check_out_lat REAL,
      check_out_lng REAL,
      status TEXT NOT NULL DEFAULT 'Tepat Waktu',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      attachment TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Default settings
  const defaultSettings = [
    { key: 'company_name', value: 'PT. Teknologi Masa Depan' },
    { key: 'work_start_time', value: '08:00' },
    { key: 'late_tolerance_time', value: '08:15' },
    { key: 'work_end_time', value: '17:00' },
    { key: 'office_latitude', value: '-6.200000' },
    { key: 'office_longitude', value: '106.816666' },
    { key: 'max_distance_meters', value: '200' },
    { key: 'require_gps', value: 'false' },
    { key: 'require_photo', value: 'true' }
  ];

  const getSetting = db.prepare('SELECT * FROM settings WHERE key = ?');
  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');

  for (const s of defaultSettings) {
    const existing = getSetting.get(s.key);
    if (!existing) {
      insertSetting.run(s.key, s.value);
    }
  }

  // Seed default users if not present
  const getUserCount = db.prepare('SELECT COUNT(*) as count FROM users');
  const userCount = getUserCount.get().count;

  if (userCount === 0) {
    const salt = bcrypt.genSaltSync(10);
    const adminPass = bcrypt.hashSync('admin123', salt);
    const userPass = bcrypt.hashSync('pegawai123', salt);

    const insertUser = db.prepare(`
      INSERT INTO users (nip, name, email, password, role, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertUser.run('ADM-001', 'Administrator Utama', 'admin@example.com', adminPass, 'admin', 'Super Admin');
    insertUser.run('PEG-001', 'Budi Santoso', 'budi@example.com', userPass, 'pegawai', 'Software Engineer');
    insertUser.run('PEG-002', 'Siti Rahmawati', 'siti@example.com', userPass, 'pegawai', 'UI/UX Designer');
    insertUser.run('PEG-003', 'Ahmad Pratama', 'ahmad@example.com', userPass, 'pegawai', 'Marketing Lead');

    console.log('Database initialized successfully with default seed.');
  }
}

initDatabase();

module.exports = db;

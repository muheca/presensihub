const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'absensi_secret_key_2026_super_secure';

// Middlewares
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer storage for leave attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `attachment_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({ storage });

// Helper: Save Base64 Photo
function saveBase64Image(base64Data, prefix) {
  if (!base64Data || !base64Data.startsWith('data:image')) return null;
  const matches = base64Data.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;
  
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const data = Buffer.from(matches[2], 'base64');
  const filename = `${prefix}_${Date.now()}_${Math.round(Math.random() * 1e9)}.${ext}`;
  const filePath = path.join(__dirname, 'public', 'uploads', filename);
  
  fs.writeFileSync(filePath, data);
  return `/uploads/${filename}`;
}

// Helper: Calculate GPS Distance in Meters (Haversine formula)
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Helper: Get Setting from DB
function getSettingValue(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

// Auth Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Akses ditolak: Token tidak ditemukan' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Sesi berakhir atau token tidak valid' });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Akses khusus Administrator' });
  }
  next();
}

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email dan password wajib diisi' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(400).json({ success: false, message: 'Email atau password salah' });
  }

  const validPassword = bcrypt.compareSync(password, user.password);
  if (!validPassword) {
    return res.status(400).json({ success: false, message: 'Email atau password salah' });
  }

  const token = jwt.sign(
    { id: user.id, nip: user.nip, name: user.name, email: user.email, role: user.role, position: user.position },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    message: 'Login berhasil',
    token,
    user: {
      id: user.id,
      nip: user.nip,
      name: user.name,
      email: user.email,
      role: user.role,
      position: user.position
    }
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, nip, name, email, role, position, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  res.json({ success: true, user });
});

// ==========================================
// 2. ATTENDANCE (PRESENSI) ROUTES
// ==========================================
app.get('/api/attendance/today', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const attendance = db.prepare('SELECT * FROM attendances WHERE user_id = ? AND date = ?').get(req.user.id, today);
  const settings = {
    work_start_time: getSettingValue('work_start_time') || '08:00',
    late_tolerance_time: getSettingValue('late_tolerance_time') || '08:15',
    work_end_time: getSettingValue('work_end_time') || '17:00',
    office_latitude: parseFloat(getSettingValue('office_latitude') || '-6.200000'),
    office_longitude: parseFloat(getSettingValue('office_longitude') || '106.816666'),
    max_distance_meters: parseInt(getSettingValue('max_distance_meters') || '200'),
    require_gps: getSettingValue('require_gps') === 'true',
    require_photo: getSettingValue('require_photo') === 'true'
  };

  res.json({
    success: true,
    today,
    attendance: attendance || null,
    settings
  });
});

app.post('/api/attendance/check-in', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS

  // Check if already checked in today
  const existing = db.prepare('SELECT * FROM attendances WHERE user_id = ? AND date = ?').get(req.user.id, today);
  if (existing && existing.check_in_time) {
    return res.status(400).json({ success: false, message: 'Anda sudah melakukan presensi masuk hari ini' });
  }

  const { photo, lat, lng, notes } = req.body;

  // GPS Check if required
  const requireGps = getSettingValue('require_gps') === 'true';
  if (requireGps) {
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'Lokasi GPS diperlukan untuk melakukan presensi' });
    }
    const officeLat = parseFloat(getSettingValue('office_latitude') || '-6.200000');
    const officeLng = parseFloat(getSettingValue('office_longitude') || '106.816666');
    const maxDistance = parseInt(getSettingValue('max_distance_meters') || '200');

    const distance = getDistanceMeters(lat, lng, officeLat, officeLng);
    if (distance > maxDistance) {
      return res.status(400).json({
        success: false,
        message: `Anda berada di luar radius kantor (${distance} meter). Maksimal radius: ${maxDistance} meter.`
      });
    }
  }

  // Save photo
  let photoUrl = null;
  if (photo) {
    photoUrl = saveBase64Image(photo, `checkin_user_${req.user.id}`);
  }

  // Determine status (Tepat Waktu / Terlambat)
  const lateTolerance = getSettingValue('late_tolerance_time') || '08:15';
  const currentHM = timeStr.substring(0, 5);
  const status = currentHM > lateTolerance ? 'Terlambat' : 'Tepat Waktu';

  if (existing) {
    // If there was an entry (e.g. created for placeholder), update it
    db.prepare(`
      UPDATE attendances 
      SET check_in_time = ?, check_in_photo = ?, check_in_lat = ?, check_in_lng = ?, status = ?, notes = ?
      WHERE id = ?
    `).run(timeStr, photoUrl, lat || null, lng || null, status, notes || null, existing.id);
  } else {
    // Insert new record
    db.prepare(`
      INSERT INTO attendances (user_id, date, check_in_time, check_in_photo, check_in_lat, check_in_lng, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, today, timeStr, photoUrl, lat || null, lng || null, status, notes || null);
  }

  res.json({
    success: true,
    message: `Presensi masuk berhasil recorded (${status}) pada ${timeStr}`,
    status,
    time: timeStr
  });
});

app.post('/api/attendance/check-out', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];

  const attendance = db.prepare('SELECT * FROM attendances WHERE user_id = ? AND date = ?').get(req.user.id, today);
  if (!attendance || !attendance.check_in_time) {
    return res.status(400).json({ success: false, message: 'Anda belum melakukan presensi masuk hari ini' });
  }

  if (attendance.check_out_time) {
    return res.status(400).json({ success: false, message: 'Anda sudah melakukan presensi pulang hari ini' });
  }

  const { photo, lat, lng, notes } = req.body;
  let photoUrl = null;
  if (photo) {
    photoUrl = saveBase64Image(photo, `checkout_user_${req.user.id}`);
  }

  const updatedNotes = attendance.notes 
    ? `${attendance.notes} | Pulang: ${notes || '-'}` 
    : (notes ? `Pulang: ${notes}` : null);

  db.prepare(`
    UPDATE attendances 
    SET check_out_time = ?, check_out_photo = ?, check_out_lat = ?, check_out_lng = ?, notes = ?
    WHERE id = ?
  `).run(timeStr, photoUrl, lat || null, lng || null, updatedNotes, attendance.id);

  res.json({
    success: true,
    message: `Presensi pulang berhasil pada ${timeStr}`,
    time: timeStr
  });
});

app.get('/api/attendance/history', authenticateToken, (req, res) => {
  const month = req.query.month || new Date().toISOString().substring(0, 7); // YYYY-MM
  const history = db.prepare(`
    SELECT * FROM attendances 
    WHERE user_id = ? AND date LIKE ? 
    ORDER BY date DESC
  `).all(req.user.id, `${month}%`);

  res.json({ success: true, history });
});

// ==========================================
// 3. LEAVE (IZIN / SAKIT / CUTI) ROUTES
// ==========================================
app.post('/api/leaves/apply', authenticateToken, upload.single('attachment'), (req, res) => {
  const { type, start_date, end_date, reason } = req.body;
  if (!type || !start_date || !end_date || !reason) {
    return res.status(400).json({ success: false, message: 'Semua kolom formulir permohonan wajib diisi' });
  }

  const attachmentUrl = req.file ? `/uploads/${req.file.filename}` : null;

  db.prepare(`
    INSERT INTO leaves (user_id, type, start_date, end_date, reason, attachment, status)
    VALUES (?, ?, ?, ?, ?, ?, 'Pending')
  `).run(req.user.id, type, start_date, end_date, reason, attachmentUrl);

  res.json({ success: true, message: 'Permohonan izin berhasil diajukan dan menunggu persetujuan Admin' });
});

app.get('/api/leaves/my', authenticateToken, (req, res) => {
  const leaves = db.prepare(`
    SELECT * FROM leaves WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.id);
  res.json({ success: true, leaves });
});

// ==========================================
// 4. ADMIN MANAGEMENT & REPORTS
// ==========================================
app.get('/api/admin/summary', authenticateToken, requireAdmin, (req, res) => {
  const today = req.query.date || new Date().toISOString().split('T')[0];

  const totalEmployees = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'pegawai'").get().count;
  
  const todayAttendances = db.prepare(`
    SELECT a.*, u.name, u.nip, u.position
    FROM attendances a
    JOIN users u ON a.user_id = u.id
    WHERE a.date = ?
  `).all(today);

  const onTimeCount = todayAttendances.filter(a => a.status === 'Tepat Waktu').length;
  const lateCount = todayAttendances.filter(a => a.status === 'Terlambat').length;
  const leaveCount = todayAttendances.filter(a => a.status === 'Izin' || a.status === 'Cuti').length;
  const sickCount = todayAttendances.filter(a => a.status === 'Sakit').length;
  const presentTotal = onTimeCount + lateCount;
  const absentCount = Math.max(0, totalEmployees - (presentTotal + leaveCount + sickCount));

  const pendingLeaves = db.prepare("SELECT COUNT(*) as count FROM leaves WHERE status = 'Pending'").get().count;

  res.json({
    success: true,
    today,
    summary: {
      totalEmployees,
      presentTotal,
      onTimeCount,
      lateCount,
      leaveCount,
      sickCount,
      absentCount,
      pendingLeaves
    }
  });
});

app.get('/api/admin/attendances', authenticateToken, requireAdmin, (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const status = req.query.status;
  const search = req.query.search;

  let query = `
    SELECT a.*, u.name as user_name, u.nip as user_nip, u.position as user_position, u.email as user_email
    FROM attendances a
    JOIN users u ON a.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (date) {
    query += ` AND a.date = ?`;
    params.push(date);
  }

  if (status && status !== 'ALL') {
    query += ` AND a.status = ?`;
    params.push(status);
  }

  if (search) {
    query += ` AND (u.name LIKE ? OR u.nip LIKE ? OR u.position LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY a.check_in_time DESC, a.date DESC`;

  const attendances = db.prepare(query).all(...params);
  res.json({ success: true, attendances });
});

// Admin Users CRUD
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, nip, name, email, role, position, created_at FROM users ORDER BY id ASC').all();
  res.json({ success: true, users });
});

app.post('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const { nip, name, email, password, role, position } = req.body;
  if (!nip || !name || !email || !password) {
    return res.status(400).json({ success: false, message: 'NIP, Nama, Email, dan Password wajib diisi' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR nip = ?').get(email, nip);
  if (existing) {
    return res.status(400).json({ success: false, message: 'NIP atau Email sudah terdaftar dalam sistem' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (nip, name, email, password, role, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(nip, name, email, hashedPassword, role || 'pegawai', position || 'Staff');

  res.json({ success: true, message: 'User berhasil ditambahkan' });
});

app.put('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const userId = req.params.id;
  const { nip, name, email, password, role, position } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

  if (password && password.trim() !== '') {
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare(`
      UPDATE users 
      SET nip = ?, name = ?, email = ?, password = ?, role = ?, position = ?
      WHERE id = ?
    `).run(nip || user.nip, name || user.name, email || user.email, hashedPassword, role || user.role, position || user.position, userId);
  } else {
    db.prepare(`
      UPDATE users 
      SET nip = ?, name = ?, email = ?, role = ?, position = ?
      WHERE id = ?
    `).run(nip || user.nip, name || user.name, email || user.email, role || user.role, position || user.position, userId);
  }

  res.json({ success: true, message: 'Data user berhasil diperbarui' });
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const userId = req.params.id;
  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ success: false, message: 'Anda tidak dapat menghapus akun Anda sendiri' });
  }

  // Delete user attendances and leaves first
  db.prepare('DELETE FROM attendances WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM leaves WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  res.json({ success: true, message: 'User berhasil dihapus' });
});

// Admin Leaves Management
app.get('/api/admin/leaves', authenticateToken, requireAdmin, (req, res) => {
  const leaves = db.prepare(`
    SELECT l.*, u.name as user_name, u.nip as user_nip, u.position as user_position 
    FROM leaves l
    JOIN users u ON l.user_id = u.id
    ORDER BY l.created_at DESC
  `).all();
  res.json({ success: true, leaves });
});

app.put('/api/admin/leaves/:id/status', authenticateToken, requireAdmin, (req, res) => {
  const leaveId = req.params.id;
  const { status } = req.body; // 'Approved' or 'Rejected'

  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId);
  if (!leave) return res.status(404).json({ success: false, message: 'Data permohonan izin tidak ditemukan' });

  db.prepare('UPDATE leaves SET status = ? WHERE id = ?').run(status, leaveId);

  // If approved, create attendance record placeholder for each day in range
  if (status === 'Approved') {
    const start = new Date(leave.start_date);
    const end = new Date(leave.end_date);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const existing = db.prepare('SELECT id FROM attendances WHERE user_id = ? AND date = ?').get(leave.user_id, dateStr);
      if (!existing) {
        db.prepare(`
          INSERT INTO attendances (user_id, date, status, notes)
          VALUES (?, ?, ?, ?)
        `).run(leave.user_id, dateStr, leave.type, `Pengajuan ${leave.type} disetujui: ${leave.reason}`);
      } else {
        db.prepare('UPDATE attendances SET status = ?, notes = ? WHERE id = ?').run(leave.type, `Pengajuan ${leave.type} disetujui: ${leave.reason}`, existing.id);
      }
    }
  }

  res.json({ success: true, message: `Status permohonan izin berhasil diubah menjadi ${status}` });
});

// Admin Settings
app.get('/api/admin/settings', authenticateToken, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json({ success: true, settings });
});

app.put('/api/admin/settings', authenticateToken, requireAdmin, (req, res) => {
  const updates = req.body;
  const updateStmt = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  for (const [key, value] of Object.entries(updates)) {
    updateStmt.run(key, String(value));
  }

  res.json({ success: true, message: 'Pengaturan sistem berhasil disimpan' });
});

// Export Excel Attendance Report
app.get('/api/admin/export', authenticateToken, requireAdmin, (req, res) => {
  const month = req.query.month || new Date().toISOString().substring(0, 7);
  const records = db.prepare(`
    SELECT 
      a.date as Tanggal,
      u.nip as NIP,
      u.name as Nama,
      u.position as Jabatan,
      COALESCE(a.check_in_time, '-') as Jam_Masuk,
      COALESCE(a.check_out_time, '-') as Jam_Pulang,
      a.status as Status,
      COALESCE(a.notes, '-') as Keterangan
    FROM attendances a
    JOIN users u ON a.user_id = u.id
    WHERE a.date LIKE ?
    ORDER BY a.date ASC, u.name ASC
  `).all(`${month}%`);

  const worksheet = XLSX.utils.json_to_sheet(records);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Presensi');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const filename = `Laporan_Absensi_${month}.xlsx`;

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// Fallback index for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server Absensi aktif:`);
  console.log(`   💻 Desktop:  http://localhost:${PORT}`);
  console.log(`   📱 Mobile:   http://localhost:${PORT}/mobile.html`);
  console.log(`   🌐 Wi-Fi HP: http://192.168.1.5:${PORT}/mobile.html`);
});

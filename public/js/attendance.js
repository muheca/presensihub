// Attendance Client Script
let currentUser = null;
let currentLat = null;
let currentLng = null;
let videoStream = null;
let todayAttendance = null;
let systemSettings = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await Auth.checkAuth();
  if (!currentUser) return;

  // Render User details
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userPosition').textContent = currentUser.position || 'Staff';
  document.getElementById('userInitial').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('userNipBadge').textContent = `NIP: ${currentUser.nip || '-'}`;

  // Set default month in history input
  const currentMonth = new Date().toISOString().substring(0, 7);
  document.getElementById('historyMonth').value = currentMonth;

  // Start Live Clock
  initClock();

  // Start Camera Stream
  startCamera();

  // Detect Geolocation
  fetchUserLocation();

  // Load Today Attendance Status & History
  await loadTodayStatus();
  await loadAttendanceHistory();

  lucide.createIcons();
});

// 1. Digital Clock & Date
function initClock() {
  const timeEl = document.getElementById('currentTime');
  const dateEl = document.getElementById('currentDate');

  function update() {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString('id-ID', { hour12: false });
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.textContent = now.toLocaleDateString('id-ID', options);
  }

  update();
  setInterval(update, 1000);
}

// 2. Camera Management
async function startCamera() {
  const video = document.getElementById('webcam');
  const loading = document.getElementById('cameraLoading');
  
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
      
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      
      video.srcObject = videoStream;
      video.onloadedmetadata = () => {
        video.play();
        loading.classList.add('hidden');
      };
    } catch (err) {
      console.warn('Webcam error:', err);
      loading.innerHTML = `
        <div class="text-rose-400 text-center p-4">
          <i data-lucide="camera-off" class="w-8 h-8 mx-auto mb-2"></i>
          <p class="text-xs font-semibold">Kamera tidak aktif atau izin ditolak.</p>
          <p class="text-[11px] text-slate-400 mt-1">Anda tetap dapat presensi jika mode foto opsional.</p>
        </div>
      `;
      lucide.createIcons();
    }
  } else {
    loading.innerHTML = `<span class="text-xs text-rose-400">Browser tidak mendukung akses kamera.</span>`;
  }
}

function restartCamera() {
  document.getElementById('cameraLoading').classList.remove('hidden');
  startCamera();
}

// 3. Geolocation Management
function fetchUserLocation() {
  const statusText = document.getElementById('gpsStatusText');
  const coordText = document.getElementById('gpsCoordinates');
  const iconBox = document.getElementById('gpsIconBox');

  statusText.textContent = 'Mencari sinyal GPS...';
  coordText.textContent = '-';

  if (!navigator.geolocation) {
    statusText.textContent = 'GPS tidak didukung di perangkat ini';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentLat = pos.coords.latitude;
      currentLng = pos.coords.longitude;
      const acc = Math.round(pos.coords.accuracy);

      statusText.textContent = 'Lokasi Terdeteksi Akurat';
      coordText.textContent = `Lat: ${currentLat.toFixed(5)}, Lng: ${currentLng.toFixed(5)} (±${acc}m)`;
      
      iconBox.className = 'w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5';
      iconBox.innerHTML = '<i data-lucide="check-circle-2" class="w-4 h-4"></i>';
      lucide.createIcons();
    },
    (err) => {
      console.warn('GPS Error:', err.message);
      statusText.textContent = 'GPS tidak aktif / Izin ditolak';
      coordText.textContent = 'Pastikan GPS perangkat Anda menyala';
      iconBox.className = 'w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 mt-0.5';
      iconBox.innerHTML = '<i data-lucide="alert-triangle" class="w-4 h-4"></i>';
      lucide.createIcons();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// 4. Load Today's Attendance Status
async function loadTodayStatus() {
  try {
    const res = await fetch('/api/attendance/today', {
      headers: Auth.getAuthHeaders()
    });
    const data = await res.json();

    if (!data.success) return;

    todayAttendance = data.attendance;
    systemSettings = data.settings;

    if (systemSettings) {
      document.getElementById('scheduleStart').textContent = systemSettings.work_start_time || '08:00';
      document.getElementById('scheduleTolerance').textContent = systemSettings.late_tolerance_time || '08:15';
      document.getElementById('scheduleEnd').textContent = systemSettings.work_end_time || '17:00';
    }

    const btnIn = document.getElementById('btnCheckIn');
    const btnOut = document.getElementById('btnCheckOut');
    const statusText = document.getElementById('todayStatusText');
    const timeDetails = document.getElementById('todayTimeDetails');
    const statusIcon = document.getElementById('todayStatusIcon');

    if (!todayAttendance) {
      // Belum absen sama sekali
      btnIn.disabled = false;
      btnOut.disabled = true;
      statusText.textContent = 'Belum Absen Masuk';
      statusText.className = 'text-base font-bold text-slate-800';
      timeDetails.textContent = 'Silakan posisikan wajah dan klik Presensi Masuk';
      statusIcon.className = 'w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center';
      statusIcon.innerHTML = '<i data-lucide="alert-circle" class="w-6 h-6"></i>';
    } else if (todayAttendance.check_in_time && !todayAttendance.check_out_time) {
      // Sudah masuk, belum pulang
      btnIn.disabled = true;
      btnOut.disabled = false;
      statusText.textContent = `Hadir (${todayAttendance.status})`;
      statusText.className = todayAttendance.status === 'Terlambat' ? 'text-base font-bold text-rose-600' : 'text-base font-bold text-emerald-600';
      timeDetails.textContent = `Jam Masuk: ${todayAttendance.check_in_time} WIB (Belum Presensi Pulang)`;
      statusIcon.className = 'w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center';
      statusIcon.innerHTML = '<i data-lucide="check-circle" class="w-6 h-6"></i>';
    } else if (todayAttendance.check_in_time && todayAttendance.check_out_time) {
      // Selesai hari ini
      btnIn.disabled = true;
      btnOut.disabled = true;
      statusText.textContent = 'Presensi Hari Ini Lengkap';
      statusText.className = 'text-base font-bold text-indigo-600';
      timeDetails.textContent = `Masuk: ${todayAttendance.check_in_time} | Pulang: ${todayAttendance.check_out_time} WIB`;
      statusIcon.className = 'w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center';
      statusIcon.innerHTML = '<i data-lucide="award" class="w-6 h-6"></i>';
    } else if (todayAttendance.status === 'Izin' || todayAttendance.status === 'Sakit' || todayAttendance.status === 'Cuti') {
      btnIn.disabled = true;
      btnOut.disabled = true;
      statusText.textContent = `Status: ${todayAttendance.status}`;
      statusText.className = 'text-base font-bold text-blue-600';
      timeDetails.textContent = todayAttendance.notes || 'Pengajuan izin telah disetujui';
      statusIcon.className = 'w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center';
      statusIcon.innerHTML = '<i data-lucide="calendar-check" class="w-6 h-6"></i>';
    }

    lucide.createIcons();
  } catch (err) {
    console.error('Error loading today status:', err);
  }
}

// 5. Capture Snapshot from Video
function captureSnapshot() {
  const video = document.getElementById('webcam');
  const canvas = document.getElementById('canvas');
  
  if (!video || !video.videoWidth) return null;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  return canvas.toDataURL('image/jpeg', 0.85);
}

// 6. Submit Attendance (Check-In / Check-Out)
async function submitAttendance(type) {
  const endpoint = type === 'check-in' ? '/api/attendance/check-in' : '/api/attendance/check-out';
  const actionLabel = type === 'check-in' ? 'Presensi Masuk' : 'Presensi Pulang';
  
  const photo = captureSnapshot();
  const notes = document.getElementById('attendanceNotes').value.trim();

  // Confirmation dialog
  const confirmResult = await Swal.fire({
    title: `Konfirmasi ${actionLabel}`,
    text: `Apakah Anda yakin ingin melakukan ${actionLabel.toLowerCase()} sekarang?`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: type === 'check-in' ? '#059669' : '#4f46e5',
    cancelButtonColor: '#64748b',
    confirmButtonText: `Ya, ${actionLabel}`,
    cancelButtonText: 'Batal'
  });

  if (!confirmResult.isConfirmed) return;

  Swal.fire({
    title: 'Memproses Presensi...',
    text: 'Menyimpan data dan foto Anda',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: Auth.getAuthHeaders(),
      body: JSON.stringify({
        photo,
        lat: currentLat,
        lng: currentLng,
        notes
      })
    });
    const data = await res.json();

    if (data.success) {
      Swal.fire({
        icon: 'success',
        title: 'Presensi Berhasil!',
        text: data.message,
        confirmButtonColor: '#4f46e5'
      });
      document.getElementById('attendanceNotes').value = '';
      await loadTodayStatus();
      await loadAttendanceHistory();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Presensi Gagal',
        text: data.message || 'Terjadi kesalahan saat memproses presensi.'
      });
    }
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'Kesalahan Server',
      text: 'Tidak dapat terhubung ke server.'
    });
  }
}

// 7. Load Monthly History Table
async function loadAttendanceHistory() {
  const month = document.getElementById('historyMonth').value;
  const tbody = document.getElementById('historyTableBody');

  try {
    const res = await fetch(`/api/attendance/history?month=${month}`, {
      headers: Auth.getAuthHeaders()
    });
    const data = await res.json();

    if (!data.success || !data.history || data.history.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="py-8 text-center text-slate-400">
            <i data-lucide="calendar-x" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
            Belum ada data presensi pada bulan yang dipilih.
          </td>
        </tr>
      `;
      lucide.createIcons();
      return;
    }

    tbody.innerHTML = data.history.map(item => {
      // Status badge style
      let statusBadge = '';
      if (item.status === 'Tepat Waktu') {
        statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">Tepat Waktu</span>`;
      } else if (item.status === 'Terlambat') {
        statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-700">Terlambat</span>`;
      } else if (item.status === 'Izin' || item.status === 'Cuti') {
        statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">${item.status}</span>`;
      } else if (item.status === 'Sakit') {
        statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">Sakit</span>`;
      } else {
        statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">${item.status}</span>`;
      }

      const photoThumb = item.check_in_photo 
        ? `<button onclick="openImageModal('${item.check_in_photo}', 'Presensi ${item.date}')" class="group relative block w-9 h-9 rounded-lg overflow-hidden border border-slate-200">
             <img src="${item.check_in_photo}" class="w-full h-full object-cover group-hover:scale-110 transition-transform">
             <div class="absolute inset-0 bg-black/20 group-hover:bg-transparent"></div>
           </button>`
        : `<span class="text-slate-400 text-xs">-</span>`;

      return `
        <tr class="hover:bg-slate-50/80 transition-colors">
          <td class="py-3 px-4 font-semibold text-slate-800">${formatDateIndo(item.date)}</td>
          <td class="py-3 px-4 text-slate-700">${item.check_in_time || '-'}</td>
          <td class="py-3 px-4 text-slate-700">${item.check_out_time || '-'}</td>
          <td class="py-3 px-4">${photoThumb}</td>
          <td class="py-3 px-4">${statusBadge}</td>
          <td class="py-3 px-4 text-slate-500 max-w-xs truncate">${item.notes || '-'}</td>
        </tr>
      `;
    }).join('');

    lucide.createIcons();
  } catch (err) {
    console.error('Error loading history:', err);
  }
}

// 8. Leave Modal & Form
function openLeaveModal() {
  document.getElementById('leaveStartDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('leaveEndDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('leaveModal').classList.remove('hidden');
}

function closeLeaveModal() {
  document.getElementById('leaveModal').classList.add('hidden');
  document.getElementById('leaveForm').reset();
}

document.getElementById('leaveForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitLeave');
  btn.disabled = true;
  btn.textContent = 'Mengirim...';

  const formData = new FormData();
  formData.append('type', document.getElementById('leaveType').value);
  formData.append('start_date', document.getElementById('leaveStartDate').value);
  formData.append('end_date', document.getElementById('leaveEndDate').value);
  formData.append('reason', document.getElementById('leaveReason').value);

  const fileInput = document.getElementById('leaveAttachment');
  if (fileInput.files[0]) {
    formData.append('attachment', fileInput.files[0]);
  }

  try {
    const res = await fetch('/api/leaves/apply', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Auth.getToken()}`
      },
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      closeLeaveModal();
      Swal.fire({
        icon: 'success',
        title: 'Pengajuan Berhasil',
        text: data.message,
        confirmButtonColor: '#4f46e5'
      });
      loadTodayStatus();
      loadAttendanceHistory();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Mengajukan',
        text: data.message || 'Terjadi kesalahan saat mengajukan izin.'
      });
    }
  } catch (err) {
    console.error(err);
    Swal.fire({ icon: 'error', title: 'Kesalahan Server', text: 'Gagal mengirim formulir' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kirim Permohonan';
  }
});

// 9. Lightbox Modal
function openImageModal(url, caption) {
  document.getElementById('modalImg').src = url;
  document.getElementById('modalImgCaption').textContent = caption;
  document.getElementById('imageModal').classList.remove('hidden');
}

function closeImageModal() {
  document.getElementById('imageModal').classList.add('hidden');
}

// Helpers
function formatDateIndo(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

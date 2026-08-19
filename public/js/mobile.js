// PresensiHub Mobile Client Script
let currentUser = null;
let currentLat = null;
let currentLng = null;
let mobileVideoStream = null;
let currentFacingMode = 'user'; // 'user' (front) or 'environment' (back)
let todayAttendance = null;
let systemSettings = null;
let deferredInstallPrompt = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await Auth.checkAuth();
  if (!currentUser) return;

  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker Registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  }

  // Handle PWA Install Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const banner = document.getElementById('pwaInstallPrompt');
    if (banner) banner.classList.remove('hidden');
  });

  const btnInstall = document.getElementById('btnInstallPwa');
  if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          document.getElementById('pwaInstallPrompt').classList.add('hidden');
        }
        deferredInstallPrompt = null;
      }
    });
  }

  // Populate User Info
  document.getElementById('topUserName').textContent = currentUser.name;
  document.getElementById('topUserPosition').textContent = currentUser.position || 'Staff';
  document.getElementById('topUserNip').textContent = 'NIP: ' + (currentUser.nip || '-');
  document.getElementById('topUserInitial').textContent = currentUser.name.charAt(0).toUpperCase();

  // Profile tab fields
  document.getElementById('profileName').textContent = currentUser.name;
  document.getElementById('profilePosition').textContent = currentUser.position || 'Staff';
  document.getElementById('profileNip').textContent = currentUser.nip || '-';
  document.getElementById('profileEmail').textContent = currentUser.email || '-';
  document.getElementById('profileLargeInitial').textContent = currentUser.name.charAt(0).toUpperCase();

  if (currentUser.role === 'admin') {
    const adminLink = document.getElementById('linkAdminDesktop');
    if (adminLink) adminLink.classList.remove('hidden');
  }

  // Set default history month
  const currentMonth = new Date().toISOString().substring(0, 7);
  document.getElementById('mobileHistoryMonth').value = currentMonth;
  document.getElementById('mobileLeaveStart').value = new Date().toISOString().split('T')[0];
  document.getElementById('mobileLeaveEnd').value = new Date().toISOString().split('T')[0];

  // Start Digital Clock
  initMobileClock();

  // Initialize GPS
  updateMobileGps();

  // Load Today Status & Leaves
  await loadMobileTodayStatus();
  await loadMobileLeavesList();
  await loadMobileAttendanceHistory();

  lucide.createIcons();
});

// 1. Digital Clock
function initMobileClock() {
  const clockEl = document.getElementById('mobileClockText');
  const dateEl = document.getElementById('mobileDateText');

  function tick() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('id-ID', { hour12: false });

    const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    dateEl.textContent = now.toLocaleDateString('id-ID', options);
  }

  tick();
  setInterval(tick, 1000);
}

// 2. Tab Navigation
function switchMobileTab(tabId) {
  // Hide all views
  document.querySelectorAll('.mobile-tab-view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    btn.classList.remove('text-indigo-400', 'font-bold');
    btn.classList.add('text-slate-400', 'font-medium');
  });

  const activeView = document.getElementById(tabId);
  const activeBtn = document.getElementById('nav-' + tabId);

  if (activeView && activeBtn) {
    activeView.classList.remove('hidden');
    activeBtn.classList.remove('text-slate-400', 'font-medium');
    activeBtn.classList.add('text-indigo-400', 'font-bold');
  }

  // Handle Camera start/stop
  if (tabId === 'tab-presensi') {
    startMobileCamera();
    updateMobileGps();
  } else {
    stopMobileCamera();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  lucide.createIcons();
}

// 3. Mobile Camera Handling
async function startMobileCamera() {
  const video = document.getElementById('mobileWebcam');
  const loading = document.getElementById('mobileCameraLoading');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    loading.innerHTML = '<span class="text-rose-400 text-xs">Kamera tidak didukung</span>';
    return;
  }

  try {
    stopMobileCamera();
    loading.classList.remove('hidden');

    mobileVideoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: currentFacingMode,
        width: { ideal: 720 },
        height: { ideal: 960 }
      },
      audio: false
    });

    video.srcObject = mobileVideoStream;
    video.onloadedmetadata = () => {
      video.play();
      loading.classList.add('hidden');
    };
  } catch (err) {
    console.warn('Mobile camera error:', err);
    loading.innerHTML = `
      <div class="p-3 text-center text-rose-400">
        <i data-lucide="camera-off" class="w-6 h-6 mx-auto mb-1"></i>
        <p class="text-[11px] font-bold">Izin kamera belum aktif</p>
        <p class="text-[9px] text-slate-400 mt-0.5">Izinkan akses kamera di pengaturan browser HP Anda</p>
      </div>
    `;
    lucide.createIcons();
  }
}

function stopMobileCamera() {
  if (mobileVideoStream) {
    mobileVideoStream.getTracks().forEach(t => t.stop());
    mobileVideoStream = null;
  }
}

function switchMobileCameraFacing() {
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
  startMobileCamera();
}

// 4. GPS Radar & Distance
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function updateMobileGps() {
  const miniStatus = document.getElementById('miniGpsStatus');
  const miniDist = document.getElementById('miniGpsDistance');
  const presensiDist = document.getElementById('presensiDistanceValue');
  const presensiStatus = document.getElementById('presensiGpsStatusText');

  if (miniStatus) miniStatus.textContent = 'Mencari GPS...';
  if (presensiStatus) presensiStatus.textContent = 'Mengakses satelit GPS perangkat...';

  if (!navigator.geolocation) {
    if (miniStatus) miniStatus.textContent = 'GPS tidak didukung';
    if (presensiStatus) presensiStatus.textContent = 'Perangkat tidak mendukung geolokasi.';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentLat = pos.coords.latitude;
      currentLng = pos.coords.longitude;
      const acc = Math.round(pos.coords.accuracy);

      let distText = 'Lokasi Terdeteksi';
      let distanceM = null;

      if (systemSettings && systemSettings.office_latitude && systemSettings.office_longitude) {
        const offLat = parseFloat(systemSettings.office_latitude);
        const offLng = parseFloat(systemSettings.office_longitude);
        const maxDist = parseInt(systemSettings.max_distance_meters || 200);

        distanceM = getDistanceMeters(currentLat, currentLng, offLat, offLng);
        const isInside = distanceM <= maxDist;

        if (presensiDist) {
          presensiDist.textContent = distanceM + ' Meter';
          presensiDist.className = isInside ? 'text-emerald-400 font-extrabold' : 'text-rose-400 font-extrabold';
        }

        distText = isInside ? distanceM + 'm (Dalam Radius)' : distanceM + 'm (Luar Radius)';
      }

      if (miniStatus) miniStatus.textContent = 'GPS Siap (' + distText + ')';
      if (miniDist) miniDist.textContent = 'Lat: ' + currentLat.toFixed(4) + ', Lng: ' + currentLng.toFixed(4) + ' (±' + acc + 'm)';
      if (presensiStatus) presensiStatus.textContent = 'Akurasi GPS: ±' + acc + ' meter. ' + (distanceM !== null ? 'Jarak ke kantor: ' + distanceM + 'm' : '');
    },
    (err) => {
      console.warn('GPS Error:', err.message);
      if (miniStatus) miniStatus.textContent = 'GPS Belum Aktif';
      if (miniDist) miniDist.textContent = 'Aktifkan lokasi di HP Anda';
      if (presensiStatus) presensiStatus.textContent = 'Gagal mengakses GPS. Pastikan izin lokasi aktif.';
      if (presensiDist) presensiDist.textContent = 'Tidak Terdeteksi';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// 5. Load Today Status
async function loadMobileTodayStatus() {
  try {
    const res = await fetch('/api/attendance/today', {
      headers: Auth.getAuthHeaders()
    });
    const data = await res.json();

    if (!data.success) return;

    todayAttendance = data.attendance;
    systemSettings = data.settings;

    if (systemSettings) {
      document.getElementById('homeWorkStart').textContent = systemSettings.work_start_time || '08:00';
      document.getElementById('homeTolerance').textContent = systemSettings.late_tolerance_time || '08:15';
      document.getElementById('homeWorkEnd').textContent = systemSettings.work_end_time || '17:00';
    }

    const badge = document.getElementById('todayBadgeStatus');
    const title = document.getElementById('homeStatusTitle');
    const subtitle = document.getElementById('homeStatusSubtitle');
    const iconContainer = document.getElementById('homeStatusIcon');
    const btnIn = document.getElementById('btnMobileCheckIn');
    const btnOut = document.getElementById('btnMobileCheckOut');

    if (!todayAttendance) {
      badge.textContent = 'Belum Absen';
      badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30';
      title.textContent = 'Belum Melakukan Presensi';
      subtitle.textContent = 'Buka tab Presensi untuk Check-In dengan selfie.';
      iconContainer.className = 'w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0';
      iconContainer.innerHTML = '<i data-lucide="alert-circle" class="w-6 h-6"></i>';
      btnIn.disabled = false;
      btnOut.disabled = true;
    } else if (todayAttendance.check_in_time && !todayAttendance.check_out_time) {
      const isLate = todayAttendance.status === 'Terlambat';
      badge.textContent = isLate ? 'Hadir (Terlambat)' : 'Hadir (Tepat Waktu)';
      badge.className = isLate 
        ? 'px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30'
        : 'px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      title.textContent = 'Sudah Presensi Masuk';
      subtitle.textContent = 'Jam Masuk: ' + todayAttendance.check_in_time + ' WIB. Belum Check-Out.';
      iconContainer.className = 'w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0';
      iconContainer.innerHTML = '<i data-lucide="check-circle" class="w-6 h-6"></i>';
      btnIn.disabled = true;
      btnOut.disabled = false;
    } else if (todayAttendance.check_in_time && todayAttendance.check_out_time) {
      badge.textContent = 'Selesai';
      badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
      title.textContent = 'Presensi Hari Ini Selesai';
      subtitle.textContent = 'Masuk: ' + todayAttendance.check_in_time + ' | Pulang: ' + todayAttendance.check_out_time + ' WIB';
      iconContainer.className = 'w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0';
      iconContainer.innerHTML = '<i data-lucide="award" class="w-6 h-6"></i>';
      btnIn.disabled = true;
      btnOut.disabled = true;
    } else if (todayAttendance.status === 'Izin' || todayAttendance.status === 'Sakit' || todayAttendance.status === 'Cuti') {
      badge.textContent = todayAttendance.status;
      badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30';
      title.textContent = 'Status: ' + todayAttendance.status;
      subtitle.textContent = todayAttendance.notes || 'Pengajuan izin telah diverifikasi.';
      iconContainer.className = 'w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30 shrink-0';
      iconContainer.innerHTML = '<i data-lucide="calendar-check" class="w-6 h-6"></i>';
      btnIn.disabled = true;
      btnOut.disabled = true;
    }

    lucide.createIcons();
  } catch (err) {
    console.error('Error loading mobile status:', err);
  }
}

// 6. Capture Snapshot & Submit Attendance
function captureMobileSnapshot() {
  const video = document.getElementById('mobileWebcam');
  const canvas = document.getElementById('mobileCanvas');

  if (!video || !video.videoWidth) return null;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');

  // If using front camera, mirror image
  if (currentFacingMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function submitMobileAttendance(type) {
  const endpoint = type === 'check-in' ? '/api/attendance/check-in' : '/api/attendance/check-out';
  const actionLabel = type === 'check-in' ? 'Presensi Masuk' : 'Presensi Pulang';

  const photo = captureMobileSnapshot();
  const notes = document.getElementById('mobileNotesInput').value.trim();

  // Confirmation modal
  const confirmResult = await Swal.fire({
    title: actionLabel,
    text: 'Konfirmasi kirim ' + actionLabel.toLowerCase() + ' dengan foto & koordinat GPS saat ini?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: type === 'check-in' ? '#059669' : '#4f46e5',
    confirmButtonText: 'Ya, Kirim',
    cancelButtonText: 'Batal',
    background: '#1e293b',
    color: '#f8fafc'
  });

  if (!confirmResult.isConfirmed) return;

  Swal.fire({
    title: 'Memproses...',
    text: 'Menyimpan bukti presensi',
    allowOutsideClick: false,
    background: '#1e293b',
    color: '#f8fafc',
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
        title: 'Berhasil!',
        text: data.message,
        confirmButtonColor: '#4f46e5',
        background: '#1e293b',
        color: '#f8fafc'
      });
      document.getElementById('mobileNotesInput').value = '';
      await loadMobileTodayStatus();
      await loadMobileAttendanceHistory();
      switchMobileTab('tab-home');
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Presensi Gagal',
        text: data.message || 'Terjadi kesalahan.',
        background: '#1e293b',
        color: '#f8fafc'
      });
    }
  } catch (err) {
    console.error(err);
    Swal.fire({ icon: 'error', title: 'Kesalahan Jaringan', text: 'Tidak dapat menghubungi server', background: '#1e293b', color: '#f8fafc' });
  }
}

// 7. Leaves Handler
document.getElementById('mobileLeaveForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitMobileLeave');
  btn.disabled = true;
  btn.innerHTML = '<span class="inline-block animate-spin mr-1">⏳</span> Mengirim...';

  const formData = new FormData();
  formData.append('type', document.getElementById('mobileLeaveType').value);
  formData.append('start_date', document.getElementById('mobileLeaveStart').value);
  formData.append('end_date', document.getElementById('mobileLeaveEnd').value);
  formData.append('reason', document.getElementById('mobileLeaveReason').value);

  const fileInput = document.getElementById('mobileLeaveFile');
  if (fileInput.files[0]) {
    formData.append('attachment', fileInput.files[0]);
  }

  try {
    const res = await fetch('/api/leaves/apply', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + Auth.getToken() },
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      Swal.fire({
        icon: 'success',
        title: 'Pengajuan Terkirim!',
        text: data.message,
        confirmButtonColor: '#4f46e5',
        background: '#1e293b',
        color: '#f8fafc'
      });
      document.getElementById('mobileLeaveForm').reset();
      await loadMobileLeavesList();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: data.message, background: '#1e293b', color: '#f8fafc' });
    }
  } catch (err) {
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5"></i><span>Kirim Permohonan Izin</span>';
    lucide.createIcons();
  }
});

async function loadMobileLeavesList() {
  const container = document.getElementById('mobileLeavesList');
  try {
    const res = await fetch('/api/leaves/my', { headers: Auth.getAuthHeaders() });
    const data = await res.json();

    if (!data.success || !data.leaves || data.leaves.length === 0) {
      container.innerHTML = '<div class="p-4 bg-slate-800/60 border border-slate-700/50 rounded-2xl text-center text-xs text-slate-400">Belum ada permohonan izin yang diajukan.</div>';
      return;
    }

    container.innerHTML = data.leaves.map(l => {
      let statusPill = '';
      if (l.status === 'Approved') {
        statusPill = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Disetujui</span>';
      } else if (l.status === 'Rejected') {
        statusPill = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">Ditolak</span>';
      } else {
        statusPill = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Menunggu</span>';
      }

      return `
        <div class="p-3 bg-slate-800/80 border border-slate-700/60 rounded-2xl text-xs space-y-1">
          <div class="flex items-center justify-between">
            <span class="font-bold text-white">${l.type}</span>
            ${statusPill}
          </div>
          <div class="text-[11px] text-slate-300">${l.start_date} s/d ${l.end_date}</div>
          <div class="text-[10px] text-slate-400 line-clamp-2">${l.reason}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading leaves:', err);
  }
}

// 8. Mobile History List
async function loadMobileAttendanceHistory() {
  const month = document.getElementById('mobileHistoryMonth').value;
  const container = document.getElementById('mobileHistoryContainer');

  try {
    const res = await fetch('/api/attendance/history?month=' + month, {
      headers: Auth.getAuthHeaders()
    });
    const data = await res.json();

    if (!data.success || !data.history || data.history.length === 0) {
      container.innerHTML = '<div class="p-8 text-center text-slate-400 text-xs">Tidak ada rekaman presensi pada bulan ini.</div>';
      return;
    }

    container.innerHTML = data.history.map(item => {
      let statusBadge = '';
      if (item.status === 'Tepat Waktu') {
        statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Tepat Waktu</span>';
      } else if (item.status === 'Terlambat') {
        statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30">Terlambat</span>';
      } else {
        statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30">' + item.status + '</span>';
      }

      const photoThumb = item.check_in_photo
        ? '<button onclick="openMobileImageModal(\'' + item.check_in_photo + '\', \'Presensi ' + item.date + '\')" class="w-10 h-10 rounded-xl overflow-hidden border border-slate-700 shrink-0"><img src="' + item.check_in_photo + '" class="w-full h-full object-cover"></button>'
        : '<div class="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 shrink-0"><i data-lucide="image-off" class="w-4 h-4"></i></div>';

      return `
        <div class="p-3.5 bg-slate-800/80 border border-slate-700/60 rounded-2xl flex items-center gap-3 shadow-sm">
          ${photoThumb}
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1">
              <span class="text-xs font-bold text-white truncate">${formatMobileDate(item.date)}</span>
              ${statusBadge}
            </div>
            <div class="text-[11px] text-slate-300 mt-0.5 flex items-center gap-2">
              <span>Masuk: <b class="text-slate-100">${item.check_in_time || '-'}</b></span>
              <span>Pulang: <b class="text-slate-100">${item.check_out_time || '-'}</b></span>
            </div>
            ${item.notes ? '<div class="text-[10px] text-slate-400 truncate mt-0.5">' + item.notes + '</div>' : ''}
          </div>
        </div>
      `;
    }).join('');

    lucide.createIcons();
  } catch (err) {
    console.error('Error loading mobile history:', err);
  }
}

// 9. Mobile Image Lightbox
function openMobileImageModal(url, caption) {
  document.getElementById('mobileModalImg').src = url;
  document.getElementById('mobileModalImgCaption').textContent = caption;
  document.getElementById('mobileImageModal').classList.remove('hidden');
}

function closeMobileImageModal() {
  document.getElementById('mobileImageModal').classList.add('hidden');
}

function formatMobileDate(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
}

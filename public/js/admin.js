// Admin Management Client Script
let currentAdmin = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentAdmin = await Auth.checkAuth('admin');
  if (!currentAdmin) return;

  document.getElementById('adminName').textContent = currentAdmin.name;

  // Set default today in filter date
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('filterDate').value = todayStr;

  // Load initial data
  await loadAdminSummary();
  await loadAdminAttendances();
  await loadAdminLeaves();
  await loadAdminUsers();
  await loadAdminSettings();

  lucide.createIcons();
});

// Tab Switcher
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-sm');
    btn.classList.add('bg-white', 'text-slate-600');
  });

  const activeContent = document.getElementById(tabId);
  const activeBtn = document.getElementById('btn-' + tabId);
  if (activeContent && activeBtn) {
    activeContent.classList.remove('hidden');
    activeBtn.classList.remove('bg-white', 'text-slate-600');
    activeBtn.classList.add('bg-indigo-600', 'text-white', 'shadow-sm');
  }

  lucide.createIcons();
}

// 1. Load Admin Summary Stats
async function loadAdminSummary() {
  const date = document.getElementById('filterDate').value;
  try {
    const res = await fetch('/api/admin/summary?date=' + date, {
      headers: Auth.getAuthHeaders()
    });
    const data = await res.json();

    if (!data.success) return;

    const s = data.summary;
    document.getElementById('statTotalEmployees').textContent = s.totalEmployees;
    document.getElementById('statOnTime').textContent = s.onTimeCount;
    document.getElementById('statLate').textContent = s.lateCount;
    document.getElementById('statLeave').textContent = s.leaveCount;
    document.getElementById('statSick').textContent = s.sickCount;
    document.getElementById('statAbsent').textContent = s.absentCount;

    // Badge for pending leaves
    const badge = document.getElementById('badgePendingLeaves');
    if (s.pendingLeaves > 0) {
      badge.textContent = s.pendingLeaves;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (err) {
    console.error('Error loading summary:', err);
  }
}

// 2. Load Attendances List
async function loadAdminAttendances() {
  const date = document.getElementById('filterDate').value;
  const status = document.getElementById('filterStatus').value;
  const search = document.getElementById('searchKeyword').value.trim();

  const tbody = document.getElementById('adminAttendanceTableBody');

  let url = '/api/admin/attendances?date=' + encodeURIComponent(date);
  if (status) url += '&status=' + encodeURIComponent(status);
  if (search) url += '&search=' + encodeURIComponent(search);

  try {
    const res = await fetch(url, { headers: Auth.getAuthHeaders() });
    const data = await res.json();

    if (!data.success || !data.attendances || data.attendances.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="py-10 text-center text-slate-400"><i data-lucide="clipboard-x" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>Tidak ada rekaman presensi yang cocok dengan filter.</td></tr>';
      lucide.createIcons();
      return;
    }

    tbody.innerHTML = data.attendances.map(item => {
      let statusBadge = '';
      if (item.status === 'Tepat Waktu') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">Tepat Waktu</span>';
      } else if (item.status === 'Terlambat') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-700">Terlambat</span>';
      } else if (item.status === 'Izin' || item.status === 'Cuti') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">' + item.status + '</span>';
      } else if (item.status === 'Sakit') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">Sakit</span>';
      } else {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">' + item.status + '</span>';
      }

      const photoThumb = item.check_in_photo
        ? '<button onclick="openImageModal(\'' + item.check_in_photo + '\', \'Presensi: ' + item.user_name.replace(/'/g, "\\'") + ' (' + item.date + ')\')" class="group relative block w-9 h-9 rounded-lg overflow-hidden border border-slate-200 shadow-sm"><img src="' + item.check_in_photo + '" class="w-full h-full object-cover group-hover:scale-110 transition-transform"></button>'
        : '<span class="text-slate-400 text-xs">-</span>';

      let gpsDisplay = '<span class="text-slate-400 text-xs">-</span>';
      if (item.check_in_lat && item.check_in_lng) {
        const mapsUrl = 'https://www.google.com/maps?q=' + item.check_in_lat + ',' + item.check_in_lng;
        gpsDisplay = '<a href="' + mapsUrl + '" target="_blank" class="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline"><i data-lucide="map-pin" class="w-3 h-3"></i><span>' + item.check_in_lat.toFixed(4) + ', ' + item.check_in_lng.toFixed(4) + '</span></a>';
      }

      return '<tr class="hover:bg-slate-50/80 transition-colors"><td class="py-3 px-4"><div class="font-bold text-slate-800">' + item.user_name + '</div><div class="text-[11px] text-slate-500">' + (item.user_nip || '-') + ' • ' + (item.user_position || '-') + '</div></td><td class="py-3 px-4 text-slate-700">' + item.date + '</td><td class="py-3 px-4 font-semibold text-slate-800">' + (item.check_in_time || '-') + '</td><td class="py-3 px-4 font-semibold text-slate-800">' + (item.check_out_time || '-') + '</td><td class="py-3 px-4">' + photoThumb + '</td><td class="py-3 px-4">' + statusBadge + '</td><td class="py-3 px-4">' + gpsDisplay + '</td><td class="py-3 px-4 text-slate-500 max-w-xs truncate">' + (item.notes || '-') + '</td></tr>';
    }).join('');

    lucide.createIcons();
    loadAdminSummary();
  } catch (err) {
    console.error('Error loading attendances:', err);
  }
}

// 3. Export to Excel
function exportToExcel() {
  const date = document.getElementById('filterDate').value;
  const month = date ? date.substring(0, 7) : new Date().toISOString().substring(0, 7);
  const token = Auth.getToken();

  fetch('/api/admin/export?month=' + month, {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(res => res.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Rekap_Presensi_' + month + '.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
  })
  .catch(err => {
    console.error(err);
    Swal.fire({ icon: 'error', title: 'Export Gagal', text: 'Gagal mengunduh file laporan.' });
  });
}

// 4. Load Admin Leaves
async function loadAdminLeaves() {
  const tbody = document.getElementById('adminLeavesTableBody');
  try {
    const res = await fetch('/api/admin/leaves', { headers: Auth.getAuthHeaders() });
    const data = await res.json();

    if (!data.success || !data.leaves || data.leaves.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="py-10 text-center text-slate-400"><i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>Belum ada permohonan izin yang diajukan.</td></tr>';
      lucide.createIcons();
      return;
    }

    tbody.innerHTML = data.leaves.map(item => {
      let statusBadge = '';
      if (item.status === 'Approved') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">Disetujui</span>';
      } else if (item.status === 'Rejected') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-700">Ditolak</span>';
      } else {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">Menunggu</span>';
      }

      const attachmentBtn = item.attachment
        ? '<a href="' + item.attachment + '" target="_blank" class="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"><i data-lucide="paperclip" class="w-3.5 h-3.5"></i><span>Lihat Surat</span></a>'
        : '<span class="text-slate-400 text-xs">Tidak Ada</span>';

      const actions = item.status === 'Pending' 
        ? '<div class="flex items-center justify-center gap-1.5"><button onclick="updateLeaveStatus(' + item.id + ', \'Approved\')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm">Setujui</button><button onclick="updateLeaveStatus(' + item.id + ', \'Rejected\')" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-sm">Tolak</button></div>'
        : '<span class="text-slate-400 text-xs text-center block">Selesai</span>';

      return '<tr class="hover:bg-slate-50/80 transition-colors"><td class="py-3 px-4"><div class="font-bold text-slate-800">' + item.user_name + '</div><div class="text-[11px] text-slate-500">' + (item.user_nip || '-') + ' • ' + (item.user_position || '-') + '</div></td><td class="py-3 px-4 font-semibold text-slate-700">' + item.type + '</td><td class="py-3 px-4 text-slate-600">' + item.start_date + ' s/d ' + item.end_date + '</td><td class="py-3 px-4 text-slate-600 max-w-xs">' + item.reason + '</td><td class="py-3 px-4">' + attachmentBtn + '</td><td class="py-3 px-4">' + statusBadge + '</td><td class="py-3 px-4 text-center">' + actions + '</td></tr>';
    }).join('');

    lucide.createIcons();
  } catch (err) {
    console.error('Error loading leaves:', err);
  }
}

async function updateLeaveStatus(leaveId, status) {
  const actionText = status === 'Approved' ? 'menyetujui' : 'menolak';
  const confirmResult = await Swal.fire({
    title: 'Konfirmasi',
    text: 'Apakah Anda yakin ingin ' + actionText + ' permohonan ini?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: status === 'Approved' ? '#059669' : '#e11d48',
    confirmButtonText: 'Ya, ' + (status === 'Approved' ? 'Setujui' : 'Tolak'),
    cancelButtonText: 'Batal'
  });

  if (!confirmResult.isConfirmed) return;

  try {
    const res = await fetch('/api/admin/leaves/' + leaveId + '/status', {
      method: 'PUT',
      headers: Auth.getAuthHeaders(),
      body: JSON.stringify({ status })
    });
    const data = await res.json();

    if (data.success) {
      Swal.fire({ icon: 'success', title: 'Berhasil', text: data.message, timer: 1500, showConfirmButton: false });
      loadAdminLeaves();
      loadAdminSummary();
      loadAdminAttendances();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: data.message });
    }
  } catch (err) {
    console.error(err);
  }
}

// 5. Load Admin Users
let cachedUsers = [];

async function loadAdminUsers() {
  const tbody = document.getElementById('adminUsersTableBody');
  try {
    const res = await fetch('/api/admin/users', { headers: Auth.getAuthHeaders() });
    const data = await res.json();

    if (!data.success || !data.users) return;
    cachedUsers = data.users;

    tbody.innerHTML = data.users.map((u, idx) => {
      const roleBadge = u.role === 'admin' 
        ? '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800">Admin</span>'
        : '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">Pegawai</span>';

      return '<tr class="hover:bg-slate-50/80 transition-colors"><td class="py-3 px-4 font-mono font-semibold text-slate-800">' + u.nip + '</td><td class="py-3 px-4 font-bold text-slate-800">' + u.name + '</td><td class="py-3 px-4 text-slate-600">' + u.email + '</td><td class="py-3 px-4 text-slate-600">' + (u.position || '-') + '</td><td class="py-3 px-4">' + roleBadge + '</td><td class="py-3 px-4 text-center"><div class="flex items-center justify-center gap-1"><button onclick="editUserByIdx(' + idx + ')" class="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit"><i data-lucide="edit-3" class="w-4 h-4"></i></button><button onclick="deleteUser(' + u.id + ', \'' + u.name.replace(/'/g, "\\'") + '\')" class="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Hapus"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div></td></tr>';
    }).join('');

    lucide.createIcons();
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function openUserModal() {
  document.getElementById('modalUserId').value = '';
  document.getElementById('userForm').reset();
  document.getElementById('userModalTitle').textContent = 'Tambah Pegawai Baru';
  document.getElementById('modalUserPassword').required = true;
  document.getElementById('modalPassHint').classList.add('hidden');
  document.getElementById('userModal').classList.remove('hidden');
}

function closeUserModal() {
  document.getElementById('userModal').classList.add('hidden');
}

function editUserByIdx(idx) {
  const user = cachedUsers[idx];
  if (!user) return;

  document.getElementById('modalUserId').value = user.id;
  document.getElementById('modalUserNip').value = user.nip;
  document.getElementById('modalUserName').value = user.name;
  document.getElementById('modalUserEmail').value = user.email;
  document.getElementById('modalUserPosition').value = user.position || '';
  document.getElementById('modalUserRole').value = user.role;
  document.getElementById('modalUserPassword').value = '';
  document.getElementById('modalUserPassword').required = false;
  document.getElementById('modalPassHint').classList.remove('hidden');
  document.getElementById('userModalTitle').textContent = 'Edit Data Pegawai';
  document.getElementById('userModal').classList.remove('hidden');
}

document.getElementById('userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('modalUserId').value;
  const nip = document.getElementById('modalUserNip').value.trim();
  const name = document.getElementById('modalUserName').value.trim();
  const email = document.getElementById('modalUserEmail').value.trim();
  const position = document.getElementById('modalUserPosition').value.trim();
  const role = document.getElementById('modalUserRole').value;
  const password = document.getElementById('modalUserPassword').value;

  const url = id ? '/api/admin/users/' + id : '/api/admin/users';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: Auth.getAuthHeaders(),
      body: JSON.stringify({ nip, name, email, position, role, password })
    });
    const data = await res.json();

    if (data.success) {
      closeUserModal();
      Swal.fire({ icon: 'success', title: 'Berhasil', text: data.message, timer: 1500, showConfirmButton: false });
      loadAdminUsers();
      loadAdminSummary();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: data.message });
    }
  } catch (err) {
    console.error(err);
  }
});

async function deleteUser(id, name) {
  const confirmResult = await Swal.fire({
    title: 'Hapus Pegawai?',
    text: 'Data kehadiran dan akun "' + name + '" akan dihapus permanen!',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#e11d48',
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal'
  });

  if (!confirmResult.isConfirmed) return;

  try {
    const res = await fetch('/api/admin/users/' + id, {
      method: 'DELETE',
      headers: Auth.getAuthHeaders()
    });
    const data = await res.json();

    if (data.success) {
      Swal.fire({ icon: 'success', title: 'Dihapus', text: data.message, timer: 1500, showConfirmButton: false });
      loadAdminUsers();
      loadAdminSummary();
      loadAdminAttendances();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal Menghapus', text: data.message });
    }
  } catch (err) {
    console.error(err);
  }
}

// 6. Load & Save Settings
async function loadAdminSettings() {
  try {
    const res = await fetch('/api/admin/settings', { headers: Auth.getAuthHeaders() });
    const data = await res.json();

    if (!data.success || !data.settings) return;

    const s = data.settings;
    if (s.company_name) {
      document.getElementById('settingCompanyName').value = s.company_name;
      document.getElementById('headerCompanyName').textContent = s.company_name;
    }
    if (s.work_start_time) document.getElementById('settingWorkStart').value = s.work_start_time;
    if (s.late_tolerance_time) document.getElementById('settingLateTolerance').value = s.late_tolerance_time;
    if (s.work_end_time) document.getElementById('settingWorkEnd').value = s.work_end_time;
    if (s.office_latitude) document.getElementById('settingOfficeLat').value = s.office_latitude;
    if (s.office_longitude) document.getElementById('settingOfficeLng').value = s.office_longitude;
    if (s.max_distance_meters) document.getElementById('settingMaxDistance').value = s.max_distance_meters;
    
    document.getElementById('settingRequireGps').checked = s.require_gps === 'true';
    document.getElementById('settingRequirePhoto').checked = s.require_photo !== 'false';
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btnSaveSettings');
  btn.disabled = true;

  const payload = {
    company_name: document.getElementById('settingCompanyName').value.trim(),
    work_start_time: document.getElementById('settingWorkStart').value,
    late_tolerance_time: document.getElementById('settingLateTolerance').value,
    work_end_time: document.getElementById('settingWorkEnd').value,
    office_latitude: document.getElementById('settingOfficeLat').value.trim(),
    office_longitude: document.getElementById('settingOfficeLng').value.trim(),
    max_distance_meters: document.getElementById('settingMaxDistance').value.trim(),
    require_gps: document.getElementById('settingRequireGps').checked ? 'true' : 'false',
    require_photo: document.getElementById('settingRequirePhoto').checked ? 'true' : 'false'
  };

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: Auth.getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      Swal.fire({ icon: 'success', title: 'Tersimpan', text: data.message, timer: 1500, showConfirmButton: false });
      loadAdminSettings();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: data.message });
    }
  } catch (err) {
    console.error(err);
  } finally {
    btn.disabled = false;
  }
});

function setCurrentCoordinatesAsOffice() {
  if (!navigator.geolocation) {
    Swal.fire({ icon: 'error', title: 'GPS Tidak Didukung' });
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      document.getElementById('settingOfficeLat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('settingOfficeLng').value = pos.coords.longitude.toFixed(6);
      Swal.fire({
        icon: 'success',
        title: 'Koordinat Diperbarui',
        text: 'Latitude: ' + pos.coords.latitude.toFixed(6) + ', Longitude: ' + pos.coords.longitude.toFixed(6),
        timer: 1500,
        showConfirmButton: false
      });
    },
    (err) => {
      Swal.fire({ icon: 'error', title: 'Gagal Mengambil Lokasi', text: err.message });
    },
    { enableHighAccuracy: true }
  );
}

// 7. Lightbox Modal
function openImageModal(url, caption) {
  document.getElementById('modalImg').src = url;
  document.getElementById('modalImgCaption').textContent = caption;
  document.getElementById('imageModal').classList.remove('hidden');
}

function closeImageModal() {
  document.getElementById('imageModal').classList.add('hidden');
}

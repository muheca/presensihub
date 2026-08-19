// Auth Utility Helper
const Auth = {
  getToken() {
    return localStorage.getItem('absensi_token');
  },

  getUser() {
    const userStr = localStorage.getItem('absensi_user');
    try {
      return userStr ? JSON.parse(userStr) : null;
    } catch (e) {
      return null;
    }
  },

  setSession(token, user) {
    localStorage.setItem('absensi_token', token);
    localStorage.setItem('absensi_user', JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem('absensi_token');
    localStorage.removeItem('absensi_user');
  },

  logout() {
    this.clearSession();
    window.location.href = '/index.html';
  },

  getAuthHeaders() {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  },

  async checkAuth(requiredRole = null) {
    const token = this.getToken();
    if (!token) {
      window.location.href = '/index.html';
      return null;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (!data.success) {
        this.clearSession();
        window.location.href = '/index.html';
        return null;
      }

      // Check role requirement if any
      if (requiredRole && data.user.role !== requiredRole) {
        if (data.user.role === 'admin') {
          window.location.href = '/admin.html';
        } else {
          window.location.href = '/dashboard.html';
        }
        return null;
      }

      return data.user;
    } catch (err) {
      console.error('Auth verification error:', err);
      this.clearSession();
      window.location.href = '/index.html';
      return null;
    }
  }
};

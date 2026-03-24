
const ADMIN_CONFIG = {
  passwordHash: btoa('admin1234'),  // base64 สำหรับทดสอบ
  sessionKey:   'ds_admin_session',
  sessionTTL:   60 * 60 * 1000,    // 1 ชั่วโมง (ms)
};
function adminLogin(password) {
  if (btoa(password) === ADMIN_CONFIG.passwordHash) {
    const session = { ts: Date.now(), valid: true };
    localStorage.setItem(ADMIN_CONFIG.sessionKey, JSON.stringify(session));
    return true;
  }
  return false;
}
function adminLogout() {
  localStorage.removeItem(ADMIN_CONFIG.sessionKey);
}
function isAdminLoggedIn() {
  try {
    const s = JSON.parse(localStorage.getItem(ADMIN_CONFIG.sessionKey) || 'null');
    if (!s || !s.valid) return false;
    if (Date.now() - s.ts > ADMIN_CONFIG.sessionTTL) { adminLogout(); return false; }
    return true;
  } catch { return false; }
}
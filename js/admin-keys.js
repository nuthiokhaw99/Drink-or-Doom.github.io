/* =========================================
   admin-keys.js — Admin Auth via Supabase Metadata
   ========================================= */

let _cachedIsAdmin = null;
let _adminCacheTime = 0;
const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000; // re-check ทุก 5 นาที

async function isAdminLoggedIn() {
  if (!currentUser) return false;
  const now = Date.now();
  // [FIX] ใช้ cache แค่ภายใน TTL — หลังจากนั้น re-check จาก server
  if (_cachedIsAdmin !== null && now - _adminCacheTime < ADMIN_CACHE_TTL_MS) {
    return _cachedIsAdmin;
  }

  const { data } = await _sb
    .from('profiles')
    .select('is_admin')
    .eq('id', currentUser.id)
    .single();

  _cachedIsAdmin = data?.is_admin === true;
  _adminCacheTime = now;
  return _cachedIsAdmin;
}

async function showAdmin() {
  if (!currentUser) { toast('กรุณาเข้าสู่ระบบก่อน', 'warning'); openLogin(); return; }
  if (!(await isAdminLoggedIn())) { toast('คุณไม่มีสิทธิ์เข้าหน้านี้', 'error'); return; }

  document.querySelectorAll('#home-screen, #game-screen, #admin-screen')
    .forEach(el => el.style.display = 'none');
  document.getElementById('admin-screen').style.display = 'block';

  // อ่าน tab จาก URL ถ้ามี เช่น #admin/users → restore tab นั้น
  const hash    = window.location.hash;           // เช่น #admin/users
  const tabName = hash.startsWith('#admin/')
    ? hash.replace('#admin/', '')
    : 'decks';

  const TAB_ORDER = ['decks','cards','users','stats','history','announce','settings','search'];
  const tabIdx    = TAB_ORDER.indexOf(tabName);
  const safeTab   = tabIdx >= 0 ? tabName : 'decks';
  const safeIdx   = tabIdx >= 0 ? tabIdx  : 0;

  history.pushState({}, '', '#admin/' + safeTab);

  // ✅ รอให้ DB โหลดเสร็จก่อนเสมอ
  await initDB();

  if (typeof switchTab === 'function') switchTab(safeTab, safeIdx);
  else {
    if (typeof renderAdmDecks    === 'function') renderAdmDecks();
    if (typeof renderAdmSel      === 'function') renderAdmSel();
    if (typeof loadAdminUserList === 'function') loadAdminUserList();
  }

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setVal('st-cr',     DB.settings?.startCredit  ?? 10);
  setVal('st-nm',     DB.settings?.siteName     ?? 'DRINKORDOOM');
  setVal('st-test',   DB.settings?.testMode     ?? 1);
  setVal('st-modal',  DB.settings?.showModal    ?? 1);
  setVal('st-cost',   DB.settings?.defaultCost  ?? 1);
  setVal('st-topup',  DB.settings?.topupEnabled ?? 1);
  setVal('st-layout', DB.settings?.deckLayout   ?? 'auto');
}
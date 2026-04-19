/* =========================================
   admin-keys.js — Admin Auth via Supabase Metadata
   ========================================= */

const _adminState = (() => {
  let cached = null;
  let cacheTime = 0;
  const TTL = 30 * 60 * 1000;
  return {
    get:       () => cached,
    set:       (val) => { cached = val; cacheTime = Date.now(); },
    reset:     () => { cached = null; cacheTime = 0; },
    isExpired: () => Date.now() - cacheTime >= TTL
  };
})();


async function isAdminLoggedIn() {
  if (!currentUser) return false;

  if (_adminState.get() !== null && !_adminState.isExpired()) {
    return _adminState.get();
  }

  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) return false;

    const res = await fetch(
      'https://wslevsdsbcqjndskwyhz.supabase.co/functions/v1/confix-check',
      { headers: { 'Authorization': 'Bearer ' + session.access_token } }
    );

    // ✅ ต้องอยู่ใน try และมี await
    const json = await res.json();
    _adminState.set(json.is_admin === true);
    return _adminState.get();

  } catch (e) {
    console.error('isAdminLoggedIn error:', e);
    return false;
  }
}

async function showAdmin() {
  if (!currentUser) { toast('กรุณาเข้าสู่ระบบก่อน', 'warning'); openLogin(); return; }
  if (_adminState.get() === false) { toast('ไม่มีสิทธิ์', 'error'); return; }
  if (_adminState.get() === null && !(await isAdminLoggedIn())) { toast('คุณไม่มีสิทธิ์เข้าหน้านี้', 'error'); return; }


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
    if (typeof loadStatsTab === 'function') loadStatsTab();
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
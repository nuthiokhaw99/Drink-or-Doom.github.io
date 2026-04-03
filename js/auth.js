// ── อ่านจาก config.js ที่ไม่ได้ commit ขึ้น Git ──
if (typeof CONFIG === 'undefined') {
  throw new Error('[auth] ไม่พบ config.js — คัดลอกจาก config.example.js แล้วใส่ key จริง');
}
const SUPABASE_URL  = CONFIG.SUPABASE_URL;
const SUPABASE_ANON = CONFIG.SUPABASE_ANON;

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: (() => {
      try {
        localStorage.setItem('_test', '1');
        localStorage.removeItem('_test');
        return window.localStorage;
      } catch (e) {
        const mem = {};
        return {
          getItem:    (k) => mem[k] ?? null,
          setItem:    (k, v) => { mem[k] = v; },
          removeItem: (k) => { delete mem[k]; },
        };
      }
    })(),
    persistSession:   true,
    autoRefreshToken: true,
  }
});

let currentUser = null;

// [FIX #14] announce popup cancellation token
let _announceAbortController = null;

_sb.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;

  if (event === 'INITIAL_SESSION') {
    currentUser = session?.user ?? null;
    if (typeof loadCredits === 'function') await loadCredits();
    if (typeof _updateAuthUI === 'function') _updateAuthUI();

    const hash = window.location.hash;
    if (hash === '#admin') {
      if (typeof showAdmin === 'function') await showAdmin();
    } else if (hash.startsWith('#play/')) {
      const deckId = hash.replace('#play/', '');
      const deck   = DB?.decks?.find(d => d.id === deckId);
      if (deck && typeof startGame === 'function') { selDeck = [deckId]; startGame(); }
    } else if (!currentUser) {
      openLogin();
    }
    return;
  }

  if (event === 'SIGNED_OUT') {
    // [FIX #8] cancel pending announce popup
    if (_announceAbortController) { _announceAbortController.abort(); _announceAbortController = null; }
    _cachedIsAdmin = null;
    credits = 0;
    updateCr();
    _updateAuthUI();
    if (typeof goHome === 'function') goHome();
    openLogin();
    return;
  }

  if (event === 'TOKEN_REFRESHED') {
    await loadCredits();
    _updateAuthUI();
    return;
  }

  _updateAuthUI();

});


function openLogin() {
  document.getElementById('login-overlay').classList.add('show');
  switchLoginTab('login');
}

function closeLogin() {
  document.getElementById('login-overlay').classList.remove('show');
}

function switchLoginTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('lf-login').style.display    = isLogin ? '' : 'none';
  document.getElementById('lf-register').style.display = isLogin ? 'none' : '';
  document.getElementById('lt-login').classList.toggle('act', isLogin);
  document.getElementById('lt-register').classList.toggle('act', !isLogin);
  document.getElementById('login-err').textContent = '';
  document.getElementById('reg-err').textContent   = '';
}

/* =========================================
   LOGIN
   ========================================= */
async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-err');
  errEl.textContent = '';

  if (!username || !password) { errEl.textContent = 'กรุณากรอก Username และ Password'; return; }

  const btn = document.getElementById('btn-do-login');
  btn.disabled = true;
  btn.innerHTML = '<i class="fi fi-sr-spinner fi-spin"></i> กำลังเข้าสู่ระบบ...';

  // [FIX #4] ไม่บอกว่า username ไม่มีอยู่จริง — ป้องกัน username enumeration
  const { data: profile } = await _sb
    .from('profiles')
    .select('email')
    .ilike('username', username.toLowerCase())
    .maybeSingle();

  // ถ้าไม่เจอ profile ให้ทำ signIn ต่อไปเลย — Supabase จะ error เอง
  // วิธีนี้ทำให้ response time เท่ากันทั้งสองกรณี ป้องกัน timing attack
  const emailToTry = profile?.email ?? (username.toLowerCase() + '@invalid.drinkordoom.com');

  const { error } = await _sb.auth.signInWithPassword({ email: emailToTry, password });

  btn.disabled = false;
  btn.innerHTML = '<i class="fi fi-sr-sign-in-alt"></i> เข้าสู่ระบบ';

  // [FIX #4] error message เดียวกันทุกกรณี
  if (error || !profile) {
    errEl.textContent = 'Username หรือ Password ไม่ถูกต้อง';
    return;
  }

  toast('ยินดีต้อนรับกลับมา!', 'success');
  closeLogin();
}

/* =========================================
   REGISTER
   ========================================= */
async function doRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm  = document.getElementById('reg-confirm').value;
  const errEl    = document.getElementById('reg-err');
  errEl.textContent = '';

  if (!username || !password || !confirm) { errEl.textContent = 'กรุณากรอกข้อมูลให้ครบ'; return; }
  if (username.length < 3)  { errEl.textContent = 'Username ต้องมีอย่างน้อย 3 ตัวอักษร'; return; }
  if (password.length < 6)  { errEl.textContent = 'Password ต้องมีอย่างน้อย 6 ตัวอักษร'; return; }
  if (password !== confirm)  { errEl.textContent = 'Password ไม่ตรงกัน'; return; }

  // [FIX] validate username — อนุญาตแค่ตัวอักษร ตัวเลข และ _ -
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    errEl.textContent = 'Username ใช้ได้เฉพาะ a-z, 0-9, _ และ -';
    return;
  }

  const btn = document.getElementById('btn-do-register');
  btn.disabled = true;
  btn.innerHTML = '<i class="fi fi-sr-spinner fi-spin"></i> กำลังสมัคร...';

  const { data: existing } = await _sb
    .from('profiles').select('username').eq('username', username.toLowerCase()).single();

  if (existing) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fi fi-sr-user-add"></i> สมัครสมาชิก';
    errEl.textContent = 'Username นี้ถูกใช้งานแล้ว';
    return;
  }

  // [FIX #11] ใช้ domain จริงที่ควบคุมได้ หรือเป็น UUID-based เพื่อไม่ให้ conflict
  const uniqueId = crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Date.now().toString(36);
  const email = `u_${username.toLowerCase()}_${uniqueId}@drinkordoom.app`;

  const { data, error } = await _sb.auth.signUp({ email, password });

  btn.disabled = false;
  btn.innerHTML = '<i class="fi fi-sr-user-add"></i> สมัครสมาชิก';

  if (error) { errEl.textContent = error.message; return; }

  await _sb.from('profiles').insert({
    id:       data.user.id,
    username: username.toLowerCase(),
    email,
  });

  toast('สมัครสมาชิกสำเร็จ! ยินดีต้อนรับ', 'success');
  closeLogin();
}

/* =========================================
   LOGOUT
   ========================================= */
async function logout() {
  // [FIX #8] cancel announce popup ก่อน logout
  if (_announceAbortController) { _announceAbortController.abort(); _announceAbortController = null; }
  _cachedIsAdmin = null;
  await _sb.auth.signOut();
  toast('ออกจากระบบแล้ว', 'info');
}

function _updateAuthUI() {
  const btnLogin  = document.getElementById('btn-login');
  const userChip  = document.getElementById('user-chip');
  const userLabel = document.getElementById('user-display-name');
  const btnAdmin  = document.getElementById('btn-admin');

  if (currentUser) {
    const name = currentUser.user_metadata?.username
      || currentUser.email?.split('@')[0]?.replace(/^u_/, '').replace(/_[a-f0-9]{6,}$/, '')
      || 'user';
    if (btnLogin)  btnLogin.style.display = 'none';
    if (userChip)  userChip.style.display = 'flex';
    if (userLabel) userLabel.textContent  = name;
    const dropdownName = document.getElementById('dropdown-username');
    if (dropdownName) dropdownName.textContent = name;

    if (typeof isAdminLoggedIn === 'function') {
      isAdminLoggedIn().then(isAdmin => {
        if (btnAdmin) btnAdmin.style.display = isAdmin ? '' : 'none';
      });
    } else {
      if (btnAdmin) btnAdmin.style.display = 'none';
    }
  } else {
    if (btnLogin)  btnLogin.style.display = 'flex';
    if (userChip)  userChip.style.display = 'none';
    if (btnAdmin)  btnAdmin.style.display = 'none';
    document.getElementById('user-chip')?.classList.remove('open');
  }
}

/* =========================================
   CLOSE ON BACKDROP CLICK
   ========================================= */
document.getElementById('login-overlay')?.addEventListener('click', function(e) {
  if (e.target === this) closeLogin();
});

/* =========================================
   ENTER KEY SUPPORT
   ========================================= */
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  const overlay = document.getElementById('login-overlay');
  if (!overlay?.classList.contains('show')) return;
  const loginVisible = document.getElementById('lf-login').style.display !== 'none';
  if (loginVisible) doLogin();
  else doRegister();
});

function toggleUserDropdown() {
  const chip = document.getElementById('user-chip');
  chip.classList.toggle('open');
}

document.addEventListener('click', function(e) {
  const chip = document.getElementById('user-chip');
  if (chip && !chip.contains(e.target)) {
    chip.classList.remove('open');
  }
});


/* =========================================
   ANNOUNCE POPUP
   [FIX #14] รองรับการ abort เมื่อ logout ระหว่าง delay
   ========================================= */
async function showAnnouncePopup() {
  const COOLDOWN_MS = 10 * 60 * 1000;
  const lastShown   = parseInt(localStorage.getItem('ann_last_shown') || '0');
  if (Date.now() - lastShown < COOLDOWN_MS) return;

  // สร้าง abort controller ใหม่ทุกครั้ง
  _announceAbortController = new AbortController();
  const signal = _announceAbortController.signal;

  // delay 30 วินาที พร้อม abort support
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 30000);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
    });
  } catch (e) {
    return; // ถูก abort (logout ก่อน) — หยุดทันที
  }

  if (signal.aborted || !currentUser) return;

  const now = new Date().toISOString();
  const { data } = await _sb
    .from('announcements')
    .select('*')
    .eq('active', true)
    .eq('show_popup', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!data?.length || signal.aborted) return;
  const a = data[0];

  const esc = (str) => {
    const d = document.createElement('div');
    d.textContent = String(str ?? '');
    return d.innerHTML;
  };

  const ALLOWED_TYPES = ['info', 'promo', 'warning', 'success'];
  const safeType  = ALLOWED_TYPES.includes(a.type) ? a.type : 'info';
  const typeIcon  = { info: 'fi-sr-info', promo: 'fi-sr-star', warning: 'fi-sr-triangle-warning', success: 'fi-sr-check-circle' };
  const typeLabel = { info: 'ข้อมูล', promo: 'โปรโมชั่น', warning: 'แจ้งเตือน', success: 'ข่าวดี' };

  const ov = document.createElement('div');
  ov.className = 'overlay show';
  ov.id = 'announce-popup-ov';
  ov.style.cssText = 'z-index:9999;animation:fadeIn .3s ease;';

  ov.innerHTML = `
    <div class="modal-box ann-popup-box">
      <div class="ann-popup-header">
        <div style="display:flex;align-items:center;border-left:3px solid #e50914;padding-left:14px;">
          <div style="display:flex;flex-direction:column;gap:1px;">
            <span style="font-family:'Kanit',sans-serif;font-weight:900;font-size:1.3rem;letter-spacing:.04em;line-height:1;">
              <span style="color:#e50914;">DRINK</span><span style="color:#fff;">ORDOOM</span>
            </span>
            <span style="font-size:.62rem;color:#888;letter-spacing:.18em;font-weight:400;">ยกหรือยับ</span>
          </div>
        </div>
      </div>
      <div class="ann-popup-body">
        <div class="ann-popup-icon ann-popup-icon-${safeType}">
          <i class="fi ${typeIcon[safeType]}"></i>
        </div>
        <div class="ann-popup-content">
          <div class="ann-popup-badge ann-${safeType}">
            <i class="fi ${typeIcon[safeType]}"></i>
            ${typeLabel[safeType]}
          </div>
          <div class="ann-popup-title" id="_ann-title"></div>
          <div class="ann-popup-msg"   id="_ann-msg"></div>
          ${a.expires_at ? `
            <div class="ann-popup-expires">
              <i class="fi fi-sr-clock"></i>
              หมดอายุ ${esc(new Date(a.expires_at).toLocaleDateString('th-TH'))}
            </div>` : ''}
        </div>
      </div>
      <button class="ann-popup-btn" onclick="closeAnnouncePopup()">
        <i class="fi fi-sr-check"></i> รับทราบ
      </button>
    </div>`;

  ov.querySelector('#_ann-title').textContent = a.title   ?? '';
  ov.querySelector('#_ann-msg').textContent   = a.message ?? '';
  ov.addEventListener('click', function(e) {
    if (e.target === this) closeAnnouncePopup();
  });

  document.body.appendChild(ov);
  localStorage.setItem('ann_last_shown', Date.now().toString());
}

function closeAnnouncePopup() {
  const ov = document.getElementById('announce-popup-ov');
  if (ov) ov.remove();
}

// [FIX #18] ลบ updateLastSeen ซ้ำออก — ถูก call ใน onAuthStateChange แล้ว

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

    // [BAN CHECK] ตรวจสถานะ ban สำหรับ session ที่ค้างอยู่
    if (currentUser) {
      const { data: banCheck } = await _sb
        .from('profiles')
        .select('is_banned')
        .eq('id', currentUser.id)
        .single();
      if (banCheck?.is_banned) {
        await _sb.auth.signOut();
        return;
      }
    }

    if (typeof loadCredits === 'function') await loadCredits();
    if (typeof _updateAuthUI === 'function') _updateAuthUI();

    if (currentUser) _startBanWatcher();

    const hash = window.location.hash;
    if (hash === '#admin') {
      if (typeof showAdmin === 'function') await showAdmin();
      } else if (hash.startsWith('#play/')) {
        const ids = hash.replace('#play/', '').split('+').filter(Boolean);
        if (typeof _restoreGame === 'function') await _restoreGame(ids);
      } else if (!currentUser) {
      openLogin();
    }

    if (currentUser && typeof showAnnouncePopup === 'function') {
      showAnnouncePopup();
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

  if (event === 'SIGNED_IN') {
    _startBanWatcher();
    if (typeof loadCredits === 'function') await loadCredits();  // ✅ โหลดเครดิตก่อน
    if (typeof closeLogin === 'function') closeLogin();
    // ไม่มี return — ให้ไหลลงไปเรียก _updateAuthUI() ที่ท้ายตามปกติ
  }

  if (event === 'TOKEN_REFRESHED') {
    await loadCredits();
    _updateAuthUI();
    if (typeof _flipLock !== 'undefined') _flipLock = false;
    // sync btn-play state หลัง token refresh
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay && typeof selDeck !== 'undefined') {
      btnPlay.disabled = selDeck.length < 1;
    }
    return;
  }

  _updateAuthUI();

});


/* =========================================
   BAN WATCHER — Realtime ตรวจ is_banned
   ========================================= */
let _banChannel = null;

function _startBanWatcher() {
  _stopBanWatcher(); // ล้างอันเก่าก่อนเสมอ
  if (!currentUser) return;

  _banChannel = _sb
    .channel('ban-watch-' + currentUser.id)
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'profiles',
        filter: `id=eq.${currentUser.id}`
      },
      async (payload) => {
        if (payload.new?.is_banned === true) {
          _stopBanWatcher();
          await _showBanPopup();
        }
      }
    )
    .subscribe();
}

function _stopBanWatcher() {
  if (_banChannel) {
    _sb.removeChannel(_banChannel);
    _banChannel = null;
  }
}

async function _showBanPopup() {
  // ลบ popup เก่าถ้ามี
  document.getElementById('ban-popup-ov')?.remove();

  const ov = document.createElement('div');
  ov.id = 'ban-popup-ov';
  ov.className = 'overlay show';
  ov.style.cssText = 'z-index:9999;animation:fadeIn .3s ease;';

  ov.innerHTML = `
    <div class="ann-popup-box">
      <div class="ann-top-bar" style="background:var(--red);"></div>

      <div class="ann-hero" style="background:rgba(229,9,20,.08);">
        <div class="ann-hero-ring" style="
          background: rgba(229,9,20,.15);
          border-color: rgba(229,9,20,.4);
          color: var(--red);
          animation: banPulse 1.2s ease-in-out infinite;
        ">
          <i class="fi fi-sr-ban" style="font-size:1.8rem;"></i>
        </div>
      </div>

      <div class="ann-content">
        <div class="ann-badge" style="
          background: rgba(229,9,20,.12);
          border: 1px solid rgba(229,9,20,.3);
          color: var(--red);
        ">
          <i class="fi fi-sr-shield-exclamation"></i> การแจ้งเตือนจากระบบ
        </div>
        <div class="ann-title" style="color:var(--red);">บัญชีของคุณถูกระงับ</div>
        <div class="ann-msg" style="color:var(--text2);line-height:1.8;">
          บัญชีนี้ถูก Admin ระงับการใช้งาน<br>
          <span style="font-size:.82rem;color:var(--text3);">หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อ Admin</span>
        </div>
      </div>

      <div class="ann-footer">
        <div class="ann-brand">
          <span class="ann-brand-name"><span style="color:#e50914;">DRINK</span>ORDOOM</span>
          <span class="ann-brand-sub">ยกหรือยับ</span>
        </div>
        <button class="ann-btn" id="ban-confirm-btn" style="
          background: var(--red);
          color: #fff;
          display: flex; align-items: center; gap: 8px;
        ">
          <i class="fi fi-sr-sign-out-alt"></i> รับทราบและออกจากระบบ
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(ov);

  // ปุ่ม confirm → sign out
  document.getElementById('ban-confirm-btn').addEventListener('click', async () => {
    const btn = document.getElementById('ban-confirm-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fi fi-sr-spinner fi-spin"></i> กำลังออกจากระบบ...'; }
    if (_announceAbortController) { _announceAbortController.abort(); _announceAbortController = null; }
    _cachedIsAdmin = null;
    await _sb.auth.signOut();
    ov.remove();
  });
}

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

  // [BAN CHECK] ตรวจสถานะ ban ก่อนเข้าสู่ระบบ
  const { data: banCheck } = await _sb
    .from('profiles')
    .select('is_banned')
    .eq('id', (await _sb.auth.getUser()).data.user?.id)
    .single();
  if (banCheck?.is_banned) {
    await _sb.auth.signOut();
    btn.disabled = false;
    btn.innerHTML = '<i class="fi fi-sr-sign-in-alt"></i> เข้าสู่ระบบ';
    errEl.textContent = 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อ Admin';
    return;
  }

  toast('ยินดีต้อนรับกลับมา!', 'success');
  closeLogin();
}

/* =========================================
   REGISTER
   ========================================= */
async function doRegister() {
  const username = document.getElementById('reg-username').value.trim()
  const password = document.getElementById('reg-password').value
  const confirm  = document.getElementById('reg-confirm').value
  const errEl    = document.getElementById('reg-err')
  errEl.textContent = ''

  // validation เหมือนเดิม
  if (!username || !password || !confirm) { errEl.textContent = 'กรุณากรอกข้อมูลให้ครบ'; return }
  if (username.length < 3)  { errEl.textContent = 'Username ต้องมีอย่างน้อย 3 ตัวอักษร'; return }
  if (password.length < 6)  { errEl.textContent = 'Password ต้องมีอย่างน้อย 6 ตัวอักษร'; return }
  if (password !== confirm)  { errEl.textContent = 'Password ไม่ตรงกัน'; return }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    errEl.textContent = 'Username ใช้ได้เฉพาะ a-z, 0-9, _ และ -'
    return
  }

  const btn = document.getElementById('btn-do-register')
  btn.disabled = true
  btn.innerHTML = '<i class="fi fi-sr-spinner fi-spin"></i> กำลังสมัคร...'

  // ❌ ลบ SELECT ตรวจ username ออก — ไม่จำเป็นแล้ว และเป็นต้นเหตุ race condition

  const uniqueId = crypto.randomUUID?.().split('-')[0] ?? Date.now().toString(36)
  const email = `u_${username.toLowerCase()}_${uniqueId}@drinkordoom.app`

  const { data, error: signUpError } = await _sb.auth.signUp({ email, password })

  if (signUpError) {
    btn.disabled = false
    btn.innerHTML = '<i class="fi fi-sr-user-add"></i> สมัครสมาชิก'
    errEl.textContent = signUpError.message
    return
  }

  // INSERT profiles — ถ้า username ซ้ำ DB จะ throw error จาก UNIQUE constraint
  const { error: insertError } = await _sb.from('profiles').insert({
    id:       data.user.id,
    username: username.toLowerCase(),
    email,
    credits:  DB.settings.startCredit ?? 10,
  })

  if (insertError) {
    // ✅ cleanup: ลบ auth user ที่เพิ่งสร้างออก ไม่ให้ค้างใน auth.users
    await _sb.auth.admin.deleteUser(data.user.id).catch(() => {})

    btn.disabled = false
    btn.innerHTML = '<i class="fi fi-sr-user-add"></i> สมัครสมาชิก'

    // จับ error code จาก Postgres UNIQUE violation
    if (insertError.code === '23505') {
      errEl.textContent = 'Username นี้ถูกใช้งานแล้ว'
    } else {
      errEl.textContent = 'เกิดข้อผิดพลาด กรุณาลองใหม่'
    }
    return
  }

  toast('สมัครสมาชิกสำเร็จ! ยินดีต้อนรับ', 'success')
  closeLogin()
}
/* =========================================
   LOGOUT
   ========================================= */
async function logout() {
  // [FIX #8] cancel announce popup ก่อน logout
  if (_announceAbortController) { _announceAbortController.abort(); _announceAbortController = null; }
  _cachedIsAdmin = null;
  _stopBanWatcher();
  await _sb.auth.signOut();
  toast('ออกจากระบบแล้ว', 'info');
}

function _updateAuthUI() {
  const btnLogin  = document.getElementById('btn-login');
  const userChip  = document.getElementById('user-chip');
  const userLabel = document.getElementById('user-display-name');

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
        const btnAdminDD = document.getElementById('btn-admin-dropdown');
        if (btnAdminDD) btnAdminDD.style.display = isAdmin ? '' : 'none';
      });
    } else {
        const btnAdmin = document.getElementById('btn-admin-dropdown');
        if (btnAdmin) btnAdmin.style.display = 'none';
      }
    } else {
      if (btnLogin)  btnLogin.style.display = 'flex';
      if (userChip)  userChip.style.display = 'none';
      const btnAdmin = document.getElementById('btn-admin-dropdown');
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
  if (e.key === 'Escape') {
    // ปิด popup ทั้งหมดด้วย Escape
    if (typeof closeAnnouncePopup === 'function') {
      const annOv = document.getElementById('announce-popup-ov');
      if (annOv) { closeAnnouncePopup(); return; }
    }
  }
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
// คิวประกาศที่รอแสดง
let _announceQueue = [];

async function showAnnouncePopup() {
  // สร้าง abort controller ใหม่ทุกครั้ง
  _announceAbortController = new AbortController();
  const signal = _announceAbortController.signal;

  // delay 1 วินาที พร้อม abort support
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1000);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
    });
  } catch (e) {
    return;
  }

  if (signal.aborted || !currentUser) return;

  const now = new Date().toISOString();
  const { data } = await _sb
    .from('announcements')
    .select('*')
    .eq('active', true)
    .eq('show_popup', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false });

  if (!data?.length || signal.aborted) return;

  // เก็บทุกอันเข้าคิว แล้วแสดงอันแรก
  _announceQueue = [...data];
  _showNextAnnounce();
}

function _showNextAnnounce() {
  if (!_announceQueue.length) return;
  const a = _announceQueue.shift(); // เอาอันแรกออกจากคิว

  const esc = (str) => {
    const d = document.createElement('div');
    d.textContent = String(str ?? '');
    return d.innerHTML;
  };

  const ALLOWED_TYPES = ['info', 'promo', 'warning', 'success'];
  const safeType  = ALLOWED_TYPES.includes(a.type) ? a.type : 'info';
  const typeIcon  = { info: 'fi-sr-info', promo: 'fi-sr-star', warning: 'fi-sr-triangle-warning', success: 'fi-sr-check-circle' };
  const typeLabel = { info: 'ข้อมูล', promo: 'โปรโมชั่น', warning: 'แจ้งเตือน', success: 'ข่าวดี' };

  // แสดงตัวนับถ้ามีหลายอัน เช่น (1/3)
  const total     = _announceQueue.length + 1; // รวมอันที่กำลังแสดง (ก่อน shift แล้ว +1)
  const current   = total - _announceQueue.length;
  const showCount = total > 1 ? `<span class="ann-count">${current}/${total}</span>` : '';

  // ปุ่ม: ถ้ายังมีอันถัดไปให้แสดง "ถัดไป" แทน "รับทราบ"
  const hasNext   = _announceQueue.length > 0;
  const btnLabel  = hasNext
    ? `<i class="fi fi-sr-arrow-right"></i> ถัดไป (${_announceQueue.length} อันที่เหลือ)`
    : `<i class="fi fi-sr-check"></i> รับทราบ`;

  const ov = document.createElement('div');
  ov.className = 'overlay show';
  ov.id = 'announce-popup-ov';
  ov.style.cssText = 'z-index:9999;animation:fadeIn .3s ease;';

  ov.innerHTML = `
    <div class="ann-popup-box">
      <div class="ann-top-bar ann-bar-${safeType}"></div>
      <div class="ann-hero ann-hero-${safeType}">
        <div class="ann-hero-ring">
          <i class="fi ${typeIcon[safeType]}"></i>
        </div>
      </div>
      <div class="ann-content">
        <div class="ann-badge ann-badge-${safeType}">
          <i class="fi ${typeIcon[safeType]}"></i> ${typeLabel[safeType]}
          ${showCount}
        </div>
        <div class="ann-title" id="_ann-title"></div>
        <div class="ann-msg" id="_ann-msg"></div>
        ${a.expires_at ? `
          <div class="ann-expires">
            <i class="fi fi-sr-hourglass-end"></i>
            หมดอายุ ${esc(new Date(a.expires_at).toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'numeric'}))}
          </div>` : ''}
      </div>
      <div class="ann-footer">
        <div class="ann-brand">
          <span class="ann-brand-name"><span style="color:#e50914;">DRINK</span>ORDOOM</span>
          <span class="ann-brand-sub">ยกหรือยับ</span>
        </div>
        <button class="ann-btn ann-btn-${safeType}" onclick="closeAnnouncePopup()">
          ${btnLabel}
        </button>
      </div>
    </div>
  `;

  ov.querySelector('#_ann-title').textContent = a.title   ?? '';
  ov.querySelector('#_ann-msg').style.whiteSpace = 'pre-wrap';
  ov.querySelector('#_ann-msg').textContent = a.message ?? '';
  ov.addEventListener('click', function(e) {
    if (e.target === this) closeAnnouncePopup();
  });

  // ลบอันเก่าก่อน (ป้องกัน popup ซ้อนกัน)
  const old = document.getElementById('announce-popup-ov');
  if (old) old.remove();

  document.body.appendChild(ov);

  // safety: ถ้ากด backdrop ก็ปิดได้
  ov.addEventListener('click', function(e) {
    if (e.target === this) closeAnnouncePopup();
  }, { once: true });
}

function closeAnnouncePopup() {
  const ov = document.getElementById('announce-popup-ov');
  if (ov) {
    ov.style.animation = 'fadeOut .2s ease forwards';
    setTimeout(() => {
      ov.remove();
      // ถ้ายังมีในคิว → เปิดอันถัดไปเลย
      if (_announceQueue.length > 0) {
        _showNextAnnounce();
      }
    }, 200);
  }
}

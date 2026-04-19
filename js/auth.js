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

let _announceAbortController = null;

_sb.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;

if (event === 'INITIAL_SESSION') {
  currentUser = session?.user ?? null;

  // ✅ Ban check จริง — ตรวจก่อนทำอะไรทั้งนั้น
  if (currentUser) {
    const { data: profile } = await _sb
      .from('profiles')
      .select('is_banned')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (profile?.is_banned === true) {
      // แสดง popup และ sign out ทันที
      await _showBanPopup();
      return;
    }
  }

  if (typeof loadCredits === 'function') await loadCredits();
  if (typeof _updateAuthUI === 'function') _updateAuthUI();

  if (typeof initDB === 'function') {
    await initDB();
    if (typeof renderDecks === 'function') renderDecks();
    if (typeof applyTestMode === 'function') applyTestMode();
    if (typeof injectCustomThemes === 'function') injectCustomThemes();
  }

  if (currentUser) _startBanWatcher();

  const hash = window.location.hash;
  if (hash === '#admin' || hash.startsWith('#admin/')) {
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
    if (_announceAbortController) { _announceAbortController.abort(); _announceAbortController = null; }
    _adminState.reset();
    credits = 0;
    updateCr();
    _updateAuthUI();
    if (typeof goHome === 'function') goHome();
    openLogin();
    return;
  }

  if (event === 'SIGNED_IN') {
    _startBanWatcher();
    if (typeof closeLogin === 'function') closeLogin();
  }

if (event === 'TOKEN_REFRESHED') {
    await loadCredits();
    _updateAuthUI();
    if (typeof _flipLock !== 'undefined') _flipLock = false;
    
    // [FIX] reinit ถ้า connection หลุด
    _stopBanWatcher();
    _startBanWatcher();
    
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay && typeof selDeck !== 'undefined') {
      btnPlay.disabled = selDeck.length < 1;
    }
    return;
}

  _updateAuthUI();

});

let _banChannel = null;

function _startBanWatcher() {
  _stopBanWatcher();
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

  document.getElementById('ban-confirm-btn').addEventListener('click', async () => {
    const btn = document.getElementById('ban-confirm-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fi fi-sr-spinner fi-spin"></i> กำลังออกจากระบบ...'; }
    if (_announceAbortController) { _announceAbortController.abort(); _announceAbortController = null; }
    _adminState.reset();
    await _sb.auth.signOut();
    ov.remove();
  });
}

function openLogin() {
  const overlay = document.getElementById('login-overlay');
  if (!overlay) {
    // รอ DOM แล้วค่อยเปิด
    setTimeout(openLogin, 200);
    return;
  }
  overlay.classList.add('show');
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

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-err');
  errEl.textContent = '';

  if (!username || !password) { errEl.textContent = 'กรุณากรอก Username และ Password'; return; }

  const btn = document.getElementById('btn-do-login');
  btn.disabled = true;
  btn.innerHTML = '<i class="fi fi-sr-spinner fi-spin"></i> กำลังเข้าสู่ระบบ...';

  const { data: profile } = await _sb
    .from('profiles')
    .select('email')
    .ilike('username', username.toLowerCase())
    .maybeSingle();

  const emailToTry = profile?.email ?? (username.toLowerCase() + '@invalid.drinkordoom.com');

  const { error } = await _sb.auth.signInWithPassword({ email: emailToTry, password });

  btn.disabled = false;
  btn.innerHTML = '<i class="fi fi-sr-sign-in-alt"></i> เข้าสู่ระบบ';

  if (error || !profile) {
    errEl.innerHTML = '<i class="fi fi-sr-triangle-warning"></i> Username หรือ Password ไม่ถูกต้อง';
    return;
  }

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

async function doRegister() {
  const username = document.getElementById('reg-username').value.trim()
  const password = document.getElementById('reg-password').value
  const confirm  = document.getElementById('reg-confirm').value
  const errEl    = document.getElementById('reg-err')
  errEl.textContent = ''

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

  const uniqueId = crypto.randomUUID?.().split('-')[0] ?? Date.now().toString(36)
  const email = `u_${username.toLowerCase()}_${uniqueId}@drinkordoom.app`

  const { data, error: signUpError } = await _sb.auth.signUp({
    email,
    password,
    options: {
      data: { username: username.toLowerCase() } // ✅ ส่ง username ให้ trigger
    }
  })

  if (signUpError) {
    btn.disabled = false
    btn.innerHTML = '<i class="fi fi-sr-user-add"></i> สมัครสมาชิก'
    errEl.textContent = signUpError.message
    return
  }

  // ✅ ลบ insert profiles ออกทั้งหมด — trigger จัดการแล้ว
  // ✅ รอ trigger ทำงาน 800ms
  await new Promise(r => setTimeout(r, 800))

  toast('สมัครสมาชิกสำเร็จ! ยินดีต้อนรับ', 'success')
  closeLogin()
}

async function logout() {
  if (_announceAbortController) { _announceAbortController.abort(); _announceAbortController = null; }
  _adminState.reset();
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

    // ✅ เช็ค admin — วงเล็บถูกต้อง
    if (typeof isAdminLoggedIn === 'function') {
      isAdminLoggedIn().then(isAdmin => {
        const btnAdminDD = document.getElementById('btn-admin-dropdown');
        if (btnAdminDD) btnAdminDD.style.display = isAdmin ? '' : 'none';
      });
    } else {
      const btnAdminDD = document.getElementById('btn-admin-dropdown');
      if (btnAdminDD) btnAdminDD.style.display = 'none';
    }

  } else {
    // ✅ ไม่ได้ login
    if (btnLogin)  btnLogin.style.display = 'flex';
    if (userChip)  userChip.style.display = 'none';
    const btnAdminDD = document.getElementById('btn-admin-dropdown');
    if (btnAdminDD) btnAdminDD.style.display = 'none';
    document.getElementById('user-chip')?.classList.remove('open');
  }
}

document.getElementById('login-overlay')?.addEventListener('click', function(e) {
  if (e.target === this) closeLogin();
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
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

let _announceQueue = [];

async function showAnnouncePopup() {
  _announceAbortController = new AbortController();
  const signal = _announceAbortController.signal;

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

  _announceQueue = [...data];
  _showNextAnnounce();
}

function _showNextAnnounce() {
  if (!_announceQueue.length) return;
  const a = _announceQueue.shift(); 

  const esc = (str) => {
    const d = document.createElement('div');
    d.textContent = String(str ?? '');
    return d.innerHTML;
  };

  const ALLOWED_TYPES = ['info', 'promo', 'warning', 'success'];
  const safeType  = ALLOWED_TYPES.includes(a.type) ? a.type : 'info';
  const typeIcon  = { info: 'fi-sr-info', promo: 'fi-sr-star', warning: 'fi-sr-triangle-warning', success: 'fi-sr-check-circle' };
  const typeLabel = { info: 'ข้อมูล', promo: 'โปรโมชั่น', warning: 'แจ้งเตือน', success: 'ข่าวดี' };

  const total     = _announceQueue.length + 1; 
  const current   = total - _announceQueue.length;
  const showCount = total > 1 ? `<span class="ann-count">${current}/${total}</span>` : '';

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

  const old = document.getElementById('announce-popup-ov');
  if (old) old.remove();

  document.body.appendChild(ov);

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
      if (_announceQueue.length > 0) {
        _showNextAnnounce();
      }
    }, 200);
  }
}

async function openProfile() {
  const overlay = document.getElementById('profile-overlay');
  overlay.style.display = 'flex';

  const name = currentUser?.user_metadata?.username
    || currentUser?.email?.split('@')[0]?.replace(/^u_/, '').replace(/_[a-f0-9]{6,}$/, '')
    || 'user';
  // แก้บรรทัด pf-username
  document.getElementById('pf-username').style.cssText = 
    'color:#fff; font-weight:800; font-size:1.2rem; letter-spacing:0.5px; font-family:Kanit,sans-serif;';
  document.getElementById('pf-username').textContent = name;

  const uid = currentUser?.id?.slice(0,8) ?? '-';
  document.getElementById('pf-uid').textContent = uid;

  const cr = await API.getCredits();
  document.getElementById('pf-credits').innerHTML =
    cr + ' <span style="font-size:.9rem;font-weight:400;color:#a88a00;">เครดิต</span>';

  const histEl = document.getElementById('pf-history');
  histEl.innerHTML = '<div style="color:#444;font-size:.85rem;text-align:center;padding:20px;">กำลังโหลด...</div>';

  const { data } = await _sb
    .from('credit_history')
    .select('amount, type, note, created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (!data?.length) {
    histEl.innerHTML = '<div style="color:#444;font-size:.85rem;text-align:center;padding:20px;">ยังไม่มีประวัติ</div>';
    return;
  }

  histEl.innerHTML = data.map(row => {
    const isAdd = row.amount > 0;
    const sign  = isAdd ? '+' : '';
    const date  = new Date(row.created_at).toLocaleDateString('th-TH', {
      day:'2-digit', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit'
    });
    return `
      <div class="pf-history-item">
        <div>
          <div class="pf-history-note">${row.note || row.type || '-'}</div>
          <div class="pf-history-date">${date}</div>
        </div>
        <div class="pf-history-amount ${isAdd ? 'plus' : 'minus'}">${sign}${row.amount}</div>
      </div>`;
  }).join('') + '<div class="pf-history-end">— ไม่มีรายการเพิ่มเติม —</div>';
}

function closeProfile() {
  document.getElementById('profile-overlay').style.display = 'none';
}

document.getElementById('profile-overlay')?.addEventListener('click', function(e) {
  if (e.target === this) closeProfile();
});

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.innerHTML = `<i class="fi fi-sr-${isHidden ? 'eye-crossed' : 'eye'}"></i>`;
}
/* =========================================
   app.js — Credits, Navigation, Utilities
   ========================================= */

const THEMES = {
  fire:        'th-fire',
  magic:       'th-magic',
  skull:       'th-skull',
  heart:       'th-heart',
  star:        'th-star',
  bolt:        'th-bolt',
  // สีเดียว (ใหม่)
  ocean:       'th-ocean',
  emerald:     'th-emerald',
  lavender:    'th-lavender',
  silver:      'th-silver',
  rose:        'th-rose',
  amber:       'th-amber',
  // ผสม 2 สี (ใหม่)
  gold_amber:    'th-gold-amber',      // เหลือ + ส้มทอง
  emerald_teal:  'th-emerald-teal',    // เขียว + มิ้น
  rose_heart:    'th-rose-heart',      // ชมพู + แดงชมพู
  ocean_lavender:'th-ocean-lavender',  // ฟ้า + ม่วงอ่อน
  fire_amber:    'th-fire-amber',      // แดง + ส้ม
  magic_lavender:'th-magic-lavender',  // ม่วง + ลาเวนเดอร์
  bolt_gold:     'th-bolt-gold',       // ส้ม + เหลือง
  ocean_emerald: 'th-ocean-emerald',   // ฟ้า + เขียวมิ้น
  default:     'th-default'
};

let credits = 0;
let selDeck = [];

const saveCr = async () => { await API.saveCredits(credits); };
const getTh = (d) => {
  if (d?.theme?.startsWith('custom:')) {
    return `th-custom-${d.id}`;
  }
  return THEMES[d?.theme || 'default'] || 'th-default';
};

function updateCr() {
  document.getElementById('cr-disp').textContent = credits;
  const gcr = document.getElementById('g-cr');
  if (gcr) gcr.textContent = credits;
}

async function loadCredits() {
  if (!currentUser) { credits = 0; updateCr(); return; }
  credits = await API.getCredits();
  updateCr();
}

function goHome() {
  selDeck = [];
  document.getElementById('home-screen').style.display  = '';
  document.getElementById('game-screen').style.display  = 'none';
  document.getElementById('admin-screen').style.display = 'none';
  document.body.classList.remove('in-game');
  history.pushState({}, '', '#');
  _updateAuthUI();
  renderDecks();
}

async function loadAdminUserList() {
  const container = document.getElementById('admin-user-list');
  if (!container) return;

  container.innerHTML = '<p style="color:var(--text3);font-size:.85rem;">กำลังโหลด...</p>';
  const users = await API.getAllUsers();

  if (!users.length) {
    container.innerHTML = '<p style="color:var(--text3);">ไม่พบผู้ใช้</p>';
    return;
  }
container.innerHTML = users.map(u => `
  <div class="ucr-row ${u.is_banned ? 'ucr-banned' : ''}">
    <div class="ucr-avatar ${u.is_admin ? 'ucr-av-admin' : ''}">
      <i class="fi ${u.is_admin ? 'fi-sr-shield-check' : 'fi-sr-user'}"></i>
    </div>
    <div class="ucr-info">
      <div class="ucr-top">
        <span class="ucr-name">${u.username}</span>
        ${u.is_admin  ? '<span class="ucr-badge ucr-badge-admin"><i class="fi fi-sr-shield-check"></i> admin</span>' : ''}
        ${u.is_banned ? '<span class="ucr-badge ucr-badge-ban"><i class="fi fi-sr-ban"></i> banned</span>' : ''}
      </div>
      <div class="ucr-sub">
        <i class="fi fi-sr-clock"></i>
        ${u.last_seen ? new Date(u.last_seen).toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'numeric' }) : 'ไม่มีข้อมูล'}
      </div>
    </div>
    <div class="ucr-ctrl">
      <div class="ucr-credit-wrap">
        <i class="fi fi-sr-coins" style="color:var(--gold);font-size:.8rem;"></i>
        <input class="ucr-input" type="number" value="${u.credits}" min="0" id="ucr-${u.id}">
      </div>
      <div class="ucr-btn-row">
        <button class="btn-sm btn-edit" onclick="saveUserCredit('${u.id}')">
          <i class="fi fi-sr-disk"></i> บันทึก
        </button>
        <button class="btn-sm ${u.is_banned ? 'btn-unban' : 'btn-ban'}" onclick="toggleBanUser('${u.id}', ${!u.is_banned})">
          <i class="fi fi-sr-${u.is_banned ? 'check' : 'ban'}"></i>
          ${u.is_banned ? 'ปลดแบน' : 'แบน'}
        </button>
      </div>
    </div>
  </div>
`).join('');
}

async function saveUserCredit(userId) {
  const input = document.getElementById('ucr-' + userId);
  const val   = parseInt(input.value);
  if (isNaN(val) || val < 0) { toast('ใส่จำนวนให้ถูกต้อง', 'error'); return; }
  const ok = await API.adminSetCredits(userId, val);
  if (ok) toast('บันทึกเครดิตแล้ว', 'success');
  else    toast('เกิดข้อผิดพลาด', 'error');
}
function customConfirm(message) {
  return new Promise(resolve => {
    document.getElementById('custom-confirm-ov')?.remove();

    const ov = document.createElement('div');
    ov.id = 'custom-confirm-ov';
    ov.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.75);
      z-index:9999;display:flex;align-items:center;justify-content:center;
      backdrop-filter:blur(4px);animation:fadeIn .2s ease;
    `;

    ov.innerHTML = `
      <div style="
        background:linear-gradient(145deg,#1c1c1c,#111);
        border:1px solid #2a2a2a;border-radius:16px;
        padding:28px 28px 22px;max-width:320px;width:90%;
        position:relative;box-shadow:0 20px 60px rgba(0,0,0,.8);
      ">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;
          background:linear-gradient(90deg,transparent,var(--red),transparent);
          border-radius:16px 16px 0 0;"></div>
        <div style="font-family:'Kanit',sans-serif;font-size:1rem;font-weight:600;
          margin-bottom:22px;line-height:1.5;color:#fff;" id="cc-msg"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="cc-cancel" style="
            background:transparent;border:1px solid #333;color:var(--text2);
            padding:9px 20px;border-radius:8px;cursor:pointer;
            font-family:'Kanit',sans-serif;font-size:.88rem;
          ">ยกเลิก</button>
          <button id="cc-ok" style="
            background:var(--red);border:none;color:#fff;
            padding:9px 20px;border-radius:8px;cursor:pointer;
            font-family:'Kanit',sans-serif;font-size:.88rem;font-weight:700;
          ">ยืนยัน</button>
        </div>
      </div>
    `;

    ov.querySelector('#cc-msg').textContent = message;
    ov.querySelector('#cc-ok').onclick     = () => { ov.remove(); resolve(true);  };
    ov.querySelector('#cc-cancel').onclick = () => { ov.remove(); resolve(false); };

    document.body.appendChild(ov);
  });
}

async function toggleBanUser(userId, ban) {
  const ok = await customConfirm(ban ? 'แบนผู้ใช้นี้?' : 'ปลดแบนผู้ใช้นี้?');
  if (!ok) return;
  const { error } = await _sb.from('profiles').update({ is_banned: ban }).eq('id', userId);
  if (error) { toast('เกิดข้อผิดพลาด', 'error'); return; }
  toast(ban ? 'แบนผู้ใช้แล้ว' : 'ปลดแบนแล้ว', ban ? 'info' : 'success');
  if (typeof loadAdminUserList === 'function') loadAdminUserList();
}

function renderDecks() {
  const g = document.getElementById('deck-grid');
  g.innerHTML = '';

  selDeck = selDeck.filter(id => {
    const d = DB.decks.find(d => d.id === id);
    return d && !d.hidden;
  });

const visibleDecks = DB.decks.filter(d => !d.hidden);

  const groups = {};
  const ORDER  = [];
  visibleDecks.forEach(d => {
    const cat = d.category?.trim() || 'ทั่วไป';
    if (!groups[cat]) { groups[cat] = []; ORDER.push(cat); }
    groups[cat].push(d);
  });

  ORDER.forEach(cat => {
    const header = document.createElement('div');
    header.className = 'deck-section-header';
    header.innerHTML = `<span>${cat}</span>`;
    g.appendChild(header);

    const row = document.createElement('div');
    row.className = 'deck-section-row layout-' + (DB.settings.deckLayout || 'auto');

    groups[cat].forEach(d => {
      const cnt = (DB.cards[d.id] || []).length;
      const th  = getTh(d);
      const el  = document.createElement('div');
      el.className = 'deck-card' + (selDeck.includes(d.id) ? ' sel' : '');
      el.innerHTML = `
          <div class="d-sel-badge"><i class="fi fi-sr-check"></i></div>
          <div class="d-ico-wrap ${th}"><i class="fi ${d.icon || 'fi-sr-layers'}"></i></div>
          <div class="d-name">${d.name}</div>
          <div class="d-cnt"><i class="fi fi-rr-copy" style="font-size:.7rem;opacity:.5;"></i> ${cnt} ใบ</div>
          ${d.desc ? `<div class="d-desc">${d.desc}</div>` : ''}
          <div class="d-cost"><i class="fi fi-sr-coins" style="font-size:.7rem;"></i> ${d.cost || 1} เครดิต/ใบ</div>`;
      el.onclick = () => {
        if (selDeck.includes(d.id)) {
          selDeck = selDeck.filter(id => id !== d.id);
        } else if (selDeck.length < 3) {
          selDeck.push(d.id);
        } else {
          toast('เลือกได้สูงสุด 3 กองครับ', 'warning');
        }
        renderDecks();
      };
      row.appendChild(el);
    });

    g.appendChild(row);
  });

  document.getElementById('btn-play').disabled = selDeck.length < 1;
}

/* ---- TOAST ---- */
const T_ICO = {
  success: 'fi-sr-check-circle',
  error:   'fi-sr-cross-circle',
  warning: 'fi-sr-bell-ring',
  info:    'fi-sr-info'
};
const T_CLR = {
  success: '#4caf50',
  error:   'var(--red)',
  warning: 'var(--gold)',
  info:    'var(--text2)'
};

function toast(msg, type = 'success') {
  const t   = document.getElementById('toast');
  const ico = document.getElementById('toast-ico');
  ico.className   = `fi ${T_ICO[type] || 'fi-sr-check-circle'}`;
  ico.style.color = T_CLR[type] || '#4caf50';
  document.getElementById('toast-msg').textContent = msg;

  if (t._t) { clearTimeout(t._t); t._t = null; }

  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');

  t._t = setTimeout(() => {
    t.classList.remove('show');
    t._t = null;
  }, 2600);

  t.onclick = () => {
    if (t._t) { clearTimeout(t._t); t._t = null; }
    t.classList.remove('show');
  };
}

function openTopup() {
  const overlay = document.getElementById('topup-overlay');
  if (!overlay) { console.error('topup-overlay not found'); return; }
  overlay.classList.add('show');
  const el = document.getElementById('topup-cr-disp');
  if (el) el.textContent = credits;
  if (typeof loadPackages === 'function') loadPackages();
}
function closeTopup() {
  document.getElementById('topup-overlay').classList.remove('show');
  document.querySelectorAll('.topup-opt').forEach(o => o.classList.remove('sel'));
}

function selPkg(el, amount, pkgId = null) {
  document.querySelectorAll('.topup-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
  if (typeof PAYMENT_CONFIG !== 'undefined') {
    selectedPackage = PAYMENT_CONFIG.packages.find(p => pkgId ? p.id === pkgId : p.coins === amount) || null;
  }
}

function applyTestMode() {
  const isTest = DB.settings.testMode === 1;
  const banner = document.getElementById('test-banner');
  const btn    = document.getElementById('test-btn');
  if (banner) banner.style.display = isTest ? '' : 'none';
  if (btn)    btn.style.display    = isTest ? '' : 'none';
}

window.addEventListener('load', async function () {
  // แสดง skeleton ก่อนเลย
  document.getElementById('deck-grid').innerHTML = `
    <div style="color:var(--text3);font-size:.85rem;text-align:center;padding:40px;">
      <i class="fi fi-sr-spinner fi-spin" style="font-size:1.5rem;color:var(--red);"></i>
      <div style="margin-top:8px;">กำลังโหลด...</div>
    </div>`;

  // โหลดพร้อมกัน
  await Promise.all([initDB(), loadCredits()]);
  applyTestMode();
  renderDecks();
  injectCustomThemes();

  /* ---- DEEP LINK: restore หน้าจาก URL เมื่อ refresh หรือเปิด link ---- */
  const hash = window.location.hash;
  if (hash === '#admin' || hash.startsWith('#admin/')) {
    showAdmin();
  } else if (hash.startsWith('#play/')) {
    const ids = hash.replace('#play/', '').split('+').filter(Boolean);
    if (typeof _restoreGame === 'function') await _restoreGame(ids);
  }

  /* ---- OVERLAY CLOSE ON BACKDROP — ย้ายมาไว้หลัง DOM โหลดเสร็จ ---- */
  ['topup-overlay', 'deck-form-ov', 'pkg-form-ov'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function (e) {
      if (e.target !== this) return;
      if (id === 'topup-overlay')    closeTopup();
      else if (id === 'res-overlay') closeRes();
      else if (id === 'pkg-form-ov') closePkgForm();
      else                           closeDeckForm();
    });
  });
});

function injectCustomThemes() {
  let css = '';
  DB.decks.forEach(d => {
    if (d.theme?.startsWith('custom:')) {
      const [, c1, c2] = d.theme.split(':');
      css += `.th-custom-${d.id}{background:linear-gradient(135deg,${c1}88,${c2}55);color:${c1};border:1px solid ${c1}44;}`;
    }
  });
  let el = document.getElementById('_custom-themes');
  if (!el) { el = document.createElement('style'); el.id = '_custom-themes'; document.head.appendChild(el); }
  el.textContent = css;
}

// let _visibilityTimer = null;

// document.addEventListener('visibilitychange', () => {
//   if (document.visibilityState !== 'visible') return;

//   clearTimeout(_visibilityTimer);
//   _visibilityTimer = setTimeout(async () => {
//     try {
//       const { data: { session } } = await _sb.auth.getSession();
//       if (session) {
//         currentUser = session.user;
//         await loadCredits();
//       } else {
//         currentUser = null;
//         credits = 0;
//         updateCr();
//       }
//     } catch (e) {
//       console.warn('visibilitychange session check failed:', e);
//     } finally {
//       _updateAuthUI();

//       // [FIX] อย่า re-render ถ้ากำลังเล่นเกมอยู่
//       const inGame = document.body.classList.contains('in-game');
//       if (!inGame) {
//         await initDB();
//         renderDecks();
//       }
//     }
//   }, 800);
// });
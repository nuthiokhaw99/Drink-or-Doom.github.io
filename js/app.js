/* =========================================
   app.js — Credits, Navigation, Utilities
   ========================================= */

const THEMES = {
  fire:    'th-fire',
  magic:   'th-magic',
  skull:   'th-skull',
  heart:   'th-heart',
  star:    'th-star',
  bolt:    'th-bolt',
  default: 'th-default'
};

let credits = 0;
let selDeck = [];

const saveCr = async () => { await API.saveCredits(credits); };
const getTh  = (d) => THEMES[d.theme || 'default'] || 'th-default';

/* ---- CREDIT DISPLAY ---- */
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

/* ---- NAVIGATION ---- */
function goHome() {
  selDeck = [];
  document.getElementById('home-screen').style.display  = '';
  document.getElementById('game-screen').style.display  = 'none';
  document.getElementById('admin-screen').style.display = 'none';
  document.body.classList.remove('in-game');
  history.pushState({}, '', '#');
  _updateAuthUI();
}

/* ---- ADMIN: USER CREDIT LIST ---- */
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
    <div class="user-cr-row">
      <div class="ucr-info">
        <span class="ucr-name">${u.username}</span>
        ${u.is_admin ? '<span class="tag" style="color:var(--red);">admin</span>' : ''}
      </div>
      <div class="ucr-ctrl">
        <input class="fc ucr-input" type="number" value="${u.credits}" min="0" id="ucr-${u.id}" style="width:90px;">
        <button class="btn-sm btn-edit" onclick="saveUserCredit('${u.id}')">
          <i class="fi fi-sr-disk"></i> บันทึก
        </button>
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

/* ---- DECK SELECTION (HOME) ---- */
function renderDecks() {
  const g = document.getElementById('deck-grid');
  g.innerHTML = '';

  // [FIX #9] ตรวจ selDeck ก่อน render — ถ้า deck ที่เลือกถูกซ่อนไปแล้ว ล้างออก
  selDeck = selDeck.filter(id => {
    const d = DB.decks.find(d => d.id === id);
    return d && !d.hidden;
  });

  const visibleDecks = DB.decks.filter(d => !d.hidden);

  // จัดกลุ่มตาม category
  const groups = {};
  const ORDER  = [];
  visibleDecks.forEach(d => {
    const cat = d.category?.trim() || 'ทั่วไป';
    if (!groups[cat]) { groups[cat] = []; ORDER.push(cat); }
    groups[cat].push(d);
  });

  ORDER.forEach(cat => {
    // Section header
    const header = document.createElement('div');
    header.className = 'deck-section-header';
    header.innerHTML = `<span>${cat}</span>`;
    g.appendChild(header);

    // Row ของไพ่ในหมวดนี้
    const row = document.createElement('div');
    row.className = 'deck-section-row';

    groups[cat].forEach(d => {
      const cnt = (DB.cards[d.id] || []).length;
      const th  = getTh(d);
      const el  = document.createElement('div');
      el.className = 'deck-card' + (selDeck.includes(d.id) ? ' sel' : '');
      el.innerHTML = `
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
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---- TOPUP MODAL ---- */
function openTopup() {
  document.getElementById('topup-overlay').classList.add('show');
  const el = document.getElementById('topup-cr-disp');
  if (el) el.textContent = credits;
}
function closeTopup() {
  document.getElementById('topup-overlay').classList.remove('show');
  document.querySelectorAll('.topup-opt').forEach(o => o.classList.remove('sel'));
}

// [FIX #15] selPkg นิยามครั้งเดียวที่นี่ — ลบออกจาก payment.js แล้ว
function selPkg(el, amount) {
  document.querySelectorAll('.topup-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
  // selectedPackage จะถูก set ใน payment.js ผ่าน amount
  if (typeof PAYMENT_CONFIG !== 'undefined') {
    selectedPackage = PAYMENT_CONFIG.packages.find(p => p.coins === amount) || null;
  }
}

/* ---- OVERLAY CLOSE ON BACKDROP ---- */
['topup-overlay', 'res-overlay', 'deck-form-ov'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', function (e) {
    if (e.target !== this) return;
    if (id === 'topup-overlay')    closeTopup();
    else if (id === 'res-overlay') closeRes();
    else                           closeDeckForm();
  });
});

/* ---- INIT ---- */
function applyTestMode() {
  const isTest = DB.settings.testMode === 1;
  const banner = document.getElementById('test-banner');
  const btn    = document.getElementById('test-btn');
  if (banner) banner.style.display = isTest ? '' : 'none';
  if (btn)    btn.style.display    = isTest ? '' : 'none';
}

window.addEventListener('load', function () {
  applyTestMode();
  renderDecks();
  // credits โหลดจาก auth.js → INITIAL_SESSION → loadCredits() → updateCr()
});

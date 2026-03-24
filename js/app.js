
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

let credits  = parseInt(localStorage.getItem('ds_cr') || '0');
let selDeck  = null;

const saveCr = () => localStorage.setItem('ds_cr', credits);
const getTh  = (d) => THEMES[d.theme || 'default'] || 'th-default';

/* ---- CREDIT DISPLAY ---- */
function updateCr() {
  document.getElementById('cr-disp').textContent = credits;
  const gcr = document.getElementById('g-cr');
  if (gcr) gcr.textContent = credits;
}

/* ---- NAVIGATION ---- */
function goHome() {
  document.getElementById('home-screen').style.display  = '';
  document.getElementById('game-screen').style.display  = 'none';
  document.getElementById('admin-screen').style.display = 'none';
  renderDecks();
  updateCr();
}

function showAdmin() {
  document.getElementById('home-screen').style.display  = 'none';
  document.getElementById('game-screen').style.display  = 'none';
  document.getElementById('admin-screen').style.display = 'block';
  renderAdmDecks();
  renderAdmSel();
  document.getElementById('st-cr').value   = DB.settings.startCredit || 10;
  document.getElementById('st-nm').value   = DB.settings.siteName || 'DRINKORDOOM';
  document.getElementById('st-test').value = DB.settings.testMode !== undefined ? DB.settings.testMode : 1;
document.getElementById('st-modal').value = DB.settings.showModal   ?? 1;  // เพิ่ม
}

/* ---- DECK SELECTION (HOME) ---- */
function renderDecks() {
  const g = document.getElementById('deck-grid');
  g.innerHTML = '';
  DB.decks.filter(d => !d.hidden).forEach(d => {  // เพิ่ม .filter(d => !d.hidden)
    const cnt = (DB.cards[d.id] || []).length;
    const th  = getTh(d);
    const el  = document.createElement('div');
    el.className = 'deck-card' + (selDeck === d.id ? ' sel' : '');
    el.innerHTML = `
      <div class="d-ico-wrap ${th}"><i class="fi ${d.icon || 'fi-sr-layers'}"></i></div>
      <div class="d-name">${d.name}</div>
      <div class="d-cnt"><i class="fi fi-rr-copy" style="font-size:.7rem;opacity:.5;"></i> ${cnt} ใบ</div>
      ${d.desc ? `<div class="d-desc">${d.desc}</div>` : ''}
      <div class="d-cost"><i class="fi fi-sr-coins" style="font-size:.7rem;"></i> ${d.cost || 1} เครดิต/ใบ</div>`;
    el.onclick = () => { selDeck = d.id; renderDecks(); };
    g.appendChild(el);
  });
  // ถ้า deck ที่เลือกอยู่ถูกซ่อน ให้ reset
  if (selDeck && DB.decks.find(d => d.id === selDeck)?.hidden) {
    selDeck = null;
  }
  document.getElementById('btn-play').disabled = !selDeck;
}

/* ---- TOAST ---- */
const T_ICO = {
  success: 'fi-sr-check-circle',
  error:   'fi-sr-cross-circle',
  warning: 'fi-sr-triangle-warning',
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
  ico.className  = `fi ${T_ICO[type] || 'fi-sr-check-circle'}`;
  ico.style.color = T_CLR[type] || '#4caf50';
  document.getElementById('toast-msg').textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---- TOPUP MODAL ---- */
function openTopup()  { document.getElementById('topup-overlay').classList.add('show'); }
function closeTopup() {
  document.getElementById('topup-overlay').classList.remove('show');
  document.querySelectorAll('.topup-opt').forEach(o => o.classList.remove('sel'));
}
function selPkg(el)   { document.querySelectorAll('.topup-opt').forEach(o => o.classList.remove('sel')); el.classList.add('sel'); }
function freeCredit() { credits += 10; saveCr(); updateCr(); toast('รับ 10 เครดิตแล้ว!', 'success'); closeTopup(); }

/* ---- OVERLAY CLOSE ON BACKDROP ---- */
['topup-overlay', 'res-overlay', 'deck-form-ov'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', function (e) {
    if (e.target !== this) return;
    if (id === 'topup-overlay')  closeTopup();
    else if (id === 'res-overlay') closeRes();
    else closeDeckForm();
  });
});

/* ---- INIT ---- */
updateCr();
renderDecks();
function applyTestMode() {
  const isTest = DB.settings.testMode === 1;
  const banner = document.getElementById('test-banner');
  const btn    = document.getElementById('test-btn');
  if (banner) banner.style.display = isTest ? '' : 'none';
  if (btn)    btn.style.display    = isTest ? '' : 'none';
}

// เพิ่มที่ด้านล่างสุด ต่อจาก renderDecks();
applyTestMode();

// let deckCards   = [];
// let revCount    = 0;
// let layoutMode  = 'scatter';   // 'scatter' | 'stack'
// let stackIndex  = 0;
// let showModal = true;

// /* ---- ตรวจจับมือถือ ---- */
// function isMobile() {
//   return window.innerWidth <= 640;
// }

// /* ---- LAYOUT TOGGLE ---- */
// function setLayout(mode) {
//   layoutMode = mode;
//   document.getElementById('lt-scatter').classList.toggle('act', mode === 'scatter');
//   document.getElementById('lt-stack').classList.toggle('act', mode === 'stack');
//   renderCards();
// }

// function toggleModal() {
//   showModal = !showModal;
//   const btn = document.getElementById('lt-modal');
//   btn.classList.toggle('act', showModal);
//   btn.querySelector('i').className = showModal ? 'fi fi-sr-eye' : 'fi fi-sr-eye-crossed';
//   toast(showModal ? 'เปิด modal แล้ว' : 'ปิด modal แล้ว', 'info');
// }

// /* ---- START GAME ---- */
// function startGame() {
//   if (!selDeck) return;
//   const deck  = DB.decks.find(d => d.id === selDeck);
//   const cards = DB.cards[selDeck] || [];

//   if (!cards.length) { toast('กองไพ่นี้ยังไม่มีไพ่!', 'warning'); return; }
//   if (credits < (deck.cost || 1)) { toast('เครดิตไม่พอ! เติมก่อนนะ', 'error'); openTopup(); return; }

//   deckCards  = [...cards].sort(() => Math.random() - .5);
//   revCount   = 0;
//   stackIndex = 0;

//   document.getElementById('home-screen').style.display = 'none';
//   document.getElementById('game-screen').style.display = 'block';

//   const th = getTh(deck);
//   const iw = document.getElementById('g-ico-wrap');
//   iw.className = 'g-deck-ico ' + th;
//   document.getElementById('g-ico').className       = 'fi ' + (deck.icon || 'fi-sr-layers');
//   document.getElementById('g-nm').textContent      = deck.name;
//   document.getElementById('cost-show').textContent = deck.cost || 1;

//   const rw = document.getElementById('res-ico-wrap');
//   rw.className = 'res-ico-wrap ' + th;
//   document.getElementById('res-ico').className = 'fi ' + (deck.icon || 'fi-sr-flame');

//   updRem();
//   updateCr();
//   renderCards();
// }

// /* ---- REMAINING COUNT ---- */
// function updRem() {
//   const t = deckCards.length;
//   document.getElementById('g-rm').textContent = 'เหลือ ' + (t - revCount) + '/' + t + ' ใบ';
// }

// /* ═══════════════════════════════════════════
//    โหมด 1 — SCATTER (กระจายเละ)
// ═══════════════════════════════════════════ */
// function renderScatter() {
//   const wrap = document.getElementById('cards-wrap');
//   wrap.innerHTML = '';

//   const mobile = isMobile();
//   const deck     = DB.decks.find(d => d.id === selDeck);
//   const deckIcon = deck?.icon || 'fi-sr-layers';
//   const deckTheme = getTh(deck);

//   // วัดพื้นที่จริงของ wrap
//   const W  = wrap.getBoundingClientRect().width || window.innerWidth - 32;
//   const CW = mobile ? 72 : 96;
//   const CH = mobile ? 104 : 138;

//   // วัดพื้นที่ความสูงจริง = จอ - header - cost-hint - padding
//   const hdr      = document.querySelector('.game-hdr')?.getBoundingClientRect().height || 80;
//   const hint     = document.querySelector('.cost-hint')?.getBoundingClientRect().height || 48;
//   const H        = window.innerHeight - hdr - hint - 48; // 48 = padding เผื่อไว้

//   wrap.style.cssText = 'width:100%;height:' + H + 'px;position:relative;overflow:hidden;';

//   const total = deckCards.length;

//   const ZX = mobile ? 6 : 7;
//   const ZY = mobile ? 5 : 5;
//   const zW = W / ZX;
//   const zH = H / ZY;

//   const zones = [];
//   for (let zy = 0; zy < ZY; zy++)
//     for (let zx = 0; zx < ZX; zx++)
//       zones.push([zx, zy]);

//   for (let i = zones.length - 1; i > 0; i--) {
//     const j = Math.floor(Math.random() * (i + 1));
//     [zones[i], zones[j]] = [zones[j], zones[i]];
//   }

//   const frag = document.createDocumentFragment();
//   const els  = [];

//   for (let i = 0; i < total; i++) {
//     const [zx, zy] = zones[i % zones.length];
//     const x   = zx * zW + Math.random() * Math.max(4, zW - CW);
//     const y   = zy * zH + Math.random() * Math.max(4, zH - CH);
//     const ang = (Math.random() - .5) * 72;
//     const z   = Math.floor(Math.random() * total) + 1;

//     const el = document.createElement('div');
//     el.className     = 'crd' + (mobile ? ' crd-sm' : '');
//     el.dataset.i     = i;
//     el.style.cssText = 'left:' + x + 'px;top:' + y + 'px;transform:rotate(' + ang + 'deg);z-index:' + z + ';opacity:0;';
//     el.innerHTML     = '<div class="crd-back ' + deckTheme + '"><i class="fi ' + deckIcon + '"></i></div>';
//     el.onclick       = () => flipCard(el, i, ang);

//     frag.appendChild(el);
//     els.push(el);
//   }

//   wrap.appendChild(frag);

//   const delay = mobile ? 5 : 10;
//   els.forEach((el, i) => {
//     setTimeout(() => {
//       el.style.transition = 'all .25s cubic-bezier(.23,1,.32,1)';
//       el.style.opacity    = '1';
//     }, i * delay);
//   });
// }

// /* ═══════════════════════════════════════════
//    โหมด 2 — STACK (เรียงตับ หยิบทีละใบ)
// ═══════════════════════════════════════════ */
// function renderStack() {
//   const wrap = document.getElementById('cards-wrap');
//   wrap.innerHTML = '';
//   wrap.style.cssText = 'min-height:420px;position:relative;';

//   wrap.innerHTML = [
//     '<div class="stack-layout">',
//       '<div class="stack-section stack-center">',
//         '<div class="discard-label" style="justify-content:center;">',
//           '<i class="fi fi-sr-layers" style="color:var(--text3);font-size:.8rem;"></i>',
//           'กองไพ่',
//         '</div>',
//         '<div class="stack-pile-wrap" id="stack-pile-wrap"></div>',
//         '<div class="stack-count" id="stack-count"></div>',
//       '</div>',
//     '</div>'
//   ].join('');

//   buildStackPile();
// }

// function buildStackPile() {
//   const pileWrap = document.getElementById('stack-pile-wrap');
//   const countEl  = document.getElementById('stack-count');
//   if (!pileWrap) return;

//   const deck      = DB.decks.find(d => d.id === selDeck);  // เพิ่ม
//   const deckIcon  = deck?.icon || 'fi-sr-layers';           // เพิ่ม
//   const deckTheme = getTh(deck);                            // เพิ่ม
//   pileWrap.innerHTML = '';
//   const remaining = deckCards.length - stackIndex;
//   if (countEl) countEl.textContent = remaining + ' ใบ';

//   if (remaining <= 0) {
//     pileWrap.innerHTML = '<div style="color:var(--text3);font-size:.85rem;text-align:center;padding:40px 16px;line-height:2;">'
//       + '<i class="fi fi-sr-check-circle" style="color:var(--red);display:block;font-size:2rem;margin-bottom:8px;"></i>'
//       + 'หยิบครบแล้ว!</div>';
//     return;
//   }

//   const showCount = Math.min(remaining, 6);
//   for (let i = showCount - 1; i >= 0; i--) {
//     const el  = document.createElement('div');
//     el.className = 'crd stack-crd';
//     const off = i * 2.5;
//     const ang = (i - showCount / 2) * 1.8;
//     el.style.cssText = 'position:absolute;left:' + off + 'px;top:' + off + 'px;'
//       + 'transform:rotate(' + ang + 'deg);z-index:' + (showCount - i) + ';'
//       + (i === 0
//         ? 'cursor:pointer;box-shadow:0 0 22px var(--glow),3px 6px 18px rgba(0,0,0,.8);animation:pulse-card 2s ease-in-out infinite;'
//         : 'cursor:default;');
//   el.innerHTML = '<div class="crd-back ' + deckTheme + '"><i class="fi ' + deckIcon + '"></i></div>';
//     if (i === 0) el.onclick = () => flipTopCard(el);
//     pileWrap.appendChild(el);
//   }
// }

// function flipTopCard(el) {
//   if (stackIndex >= deckCards.length) return;
//   const deck = DB.decks.find(d => d.id === selDeck);
//   const cost = deck ? (deck.cost || 1) : 1;

//   if (credits < cost) { toast('เครดิตไม่พอ! ต้องใช้ ' + cost + ' เครดิต', 'error'); openTopup(); return; }

//   credits -= cost;
//   saveCr();
//   updateCr();

//   el.style.animation     = '';
//   el.style.pointerEvents = 'none';
//   el.classList.add('flipping');

//   const rect = el.getBoundingClientRect();
//   for (let i = 0; i < 8; i++) {
//     const s = document.createElement('div');
//     s.className = 'spk';
//     s.style.cssText = 'left:' + (rect.left + Math.random() * rect.width) + 'px;'
//       + 'top:' + (rect.top + Math.random() * rect.height) + 'px;'
//       + '--tx:' + ((Math.random() - .5) * 80) + 'px;'
//       + '--ty:-' + (Math.random() * 60 + 20) + 'px;'
//       + 'background:' + (Math.random() > .5 ? 'var(--red)' : 'var(--gold)') + ';';
//     document.body.appendChild(s);
//     setTimeout(() => s.remove(), 900);
//   }

//   const cardData = deckCards[stackIndex];
//   stackIndex++;
//   revCount++;
//   updRem();

//   setTimeout(() => {
//     el.classList.remove('flipping');

//     // แสดงหน้าไพ่ชั่วคราวก่อน fade out
//     el.classList.add('revealed');
//     el.innerHTML = '<div class="crd-revealed-inner">'
//       + '<i class="fi fi-sr-check" style="color:var(--red);font-size:.7rem;"></i>'
//       + '<div class="crd-cat">' + cardData.cat + '</div>'
//       + '<div class="crd-txt">' + (cardData.text.length > 30 ? cardData.text.slice(0, 28) + '…' : cardData.text) + '</div>'
//       + '</div>';

//     // fade out และ remove
//     setTimeout(() => {
//       el.style.transition = 'opacity .4s ease, transform .4s ease';
//       el.style.opacity    = '0';
//       el.style.transform  = 'scale(0.6)';
//       setTimeout(() => el.remove(), 420);
//     }, 300);

//     buildStackPile();
//     setTimeout(() => showRes(cardData, deck), 200);
//   }, 560);
// }

// /* ═══════════════════════════════════════════
//    RENDER CARDS — เลือก mode
// ═══════════════════════════════════════════ */
// function renderCards() {
//   if (layoutMode === 'stack') renderStack();
//   else renderScatter();
// }

// /* ═══════════════════════════════════════════
//    FLIP CARD — scatter mode
// ═══════════════════════════════════════════ */
// function flipCard(el, idx, ang) {
//   const deck = DB.decks.find(d => d.id === selDeck);
//   const cost = deck ? (deck.cost || 1) : 1;

//   if (el.classList.contains('revealed') || el.classList.contains('flipping')) return;
//   if (credits < cost) { toast('เครดิตไม่พอ! ต้องใช้ ' + cost + ' เครดิต', 'error'); openTopup(); return; }

//   credits -= cost;
//   saveCr();
//   updateCr();
//   el.classList.add('flipping');

//   const rect = el.getBoundingClientRect();
//   for (let i = 0; i < 8; i++) {
//     const s = document.createElement('div');
//     s.className = 'spk';
//     s.style.cssText = 'left:' + (rect.left + Math.random() * rect.width) + 'px;'
//       + 'top:' + (rect.top + Math.random() * rect.height) + 'px;'
//       + '--tx:' + ((Math.random() - .5) * 80) + 'px;'
//       + '--ty:-' + (Math.random() * 60 + 20) + 'px;'
//       + 'background:' + (Math.random() > .5 ? 'var(--red)' : 'var(--gold)') + ';';
//     document.body.appendChild(s);
//     setTimeout(() => s.remove(), 900);
//   }

//   setTimeout(() => {
//     const card = deckCards[idx % deckCards.length];
//     el.classList.remove('flipping');
//     el.classList.add('revealed');
//     el.style.transform = 'rotate(' + ang + 'deg)';
//     el.style.zIndex    = '200';
//     el.innerHTML = '<div class="crd-revealed-inner">'
//       + '<i class="fi fi-sr-check" style="color:var(--red);font-size:.8rem;"></i>'
//       + '<div class="crd-cat">' + card.cat + '</div>'
//       + '<div class="crd-txt">' + (card.text.length > 42 ? card.text.slice(0, 39) + '…' : card.text) + '</div>'
//       + '</div>';
//     revCount++;
//     updRem();
//     setTimeout(() => showRes(card, deck), 200);

//     // fade out และ remove หลัง modal โผล่
//     setTimeout(() => {
//       el.style.transition = 'opacity .4s ease, transform .4s ease';
//       el.style.opacity    = '0';
//       el.style.transform  = 'scale(0.6) rotate(' + ang + 'deg)';
//       setTimeout(() => el.remove(), 420);
//     }, 800);

//   }, 560);
// }

// /* ---- RESULT MODAL ---- */
// function showRes(card, deck) {
//   const th = getTh(deck);
//   document.getElementById('res-dlbl').innerHTML =
//     '<i class="fi ' + (deck.icon || 'fi-sr-layers') + '" style="color:var(--red);"></i> ' + deck.name;
//   document.getElementById('res-ico-wrap').className = 'res-ico-wrap ' + th;
//   document.getElementById('res-ico').className = 'fi ' + (deck.icon || 'fi-sr-flame');
//   document.getElementById('res-cat').textContent = card.cat;
//   document.getElementById('res-txt').textContent  = card.text;
//   document.getElementById('res-overlay').classList.add('show');
// }

// function closeRes() {
//   document.getElementById('res-overlay').classList.remove('show');
// }
// [FIX XSS] escape HTML ก่อนแสดงข้อความจากไพ่หรือชื่อ deck
function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

let deckCards   = [];
let revCount    = 0;
let layoutMode  = 'scatter';
let stackIndex  = 0;
let showModal   = true;
let renderOffset = 0;
let displayCards = [];
let usedIndices  = new Set();
let cardHistory  = []; // ประวัติไพ่ที่เปิดแล้วในเกมนี้
let _activeDeckIds = [];
const DISPLAY_BATCH    = 80;
const RELOAD_THRESHOLD = 10;

// [FIX #5] lock สำหรับป้องกัน race condition การกดไพ่หลายใบพร้อมกัน
let _flipLock = false;

const isMobile = () => window.innerWidth <= 640;

function setLayout(mode) {
  layoutMode = mode;
  document.getElementById('lt-scatter').classList.toggle('act', mode === 'scatter');
  document.getElementById('lt-stack').classList.toggle('act', mode === 'stack');
  renderCards();
}

function toggleModal() {
  showModal = !showModal;
  const btn = document.getElementById('lt-modal');
  btn.classList.toggle('act', showModal);
  btn.querySelector('i').className = showModal ? 'fi fi-sr-eye' : 'fi fi-sr-eye-crossed';
  toast(showModal ? 'เปิด modal แล้ว' : 'ปิด modal แล้ว', 'info');
}

function spawnSparks(rect) {
  for (let i = 0; i < 8; i++) {
    const s = document.createElement('div');
    s.className = 'spk';
    s.style.cssText = `left:${rect.left + Math.random() * rect.width}px;`
      + `top:${rect.top + Math.random() * rect.height}px;`
      + `--tx:${(Math.random() - .5) * 80}px;`
      + `--ty:-${Math.random() * 60 + 20}px;`
      + `background:${Math.random() > .5 ? 'var(--red)' : 'var(--gold)'};`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
}

async function startGame() {
  if (!selDeck.length) return;

  // [FIX] เพิ่ม timeout ป้องกัน session check ค้าง
  let session;
  try {
    const result = await Promise.race([
      _sb.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]);
    session = result.data?.session;

    if (!session) {
      const refreshed = await Promise.race([
        _sb.auth.refreshSession(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]);
      session = refreshed.data?.session;
    }
  } catch (e) {
    console.warn('session check failed:', e);
    toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'warning');
    openLogin();
    return;
  }

  if (!session) {
    toast('กรุณาเข้าสู่ระบบก่อน', 'warning');
    openLogin();
    return;
  }

  currentUser = session.user;
  // ... โค้ดที่เหลือเหมือนเดิม

  const allCards = selDeck.flatMap(id =>
    (DB.cards[id] || []).map(c => ({ ...c, _deckId: id }))
  );
  if (!allCards.length) { toast('กองไพ่ที่เลือกยังไม่มีไพ่!', 'warning'); return; }

  // [FIX #10] ตรวจ credit จาก server ก่อนเริ่มเกม และ check ทุก deck ไม่ใช่แค่ deck แรก
  credits = await API.getCredits();
  updateCr();

  const minCost = selDeck.reduce((min, id) => {
    const d = DB.decks.find(d => d.id === id);
    return Math.min(min, d?.cost || 1);
  }, Infinity);

  if (credits < minCost) {
    toast('เครดิตไม่พอ! เติมก่อนนะ', 'error');
    openTopup();
    return;
  }

  deckCards    = [...allCards].sort(() => Math.random() - .5);
  revCount     = 0;
  stackIndex   = 0;
  usedIndices  = new Set();
  renderOffset = 0;
  displayCards = loadNextBatch();
  _flipLock    = false;

  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';

  const firstDeck = DB.decks.find(d => d.id === selDeck[0]);
  const isMulti  = selDeck.length > 1;
  const icoClass = isMulti ? 'fi-sr-message-question' : (firstDeck.icon || 'fi-sr-layers');
  const thClass  = isMulti ? 'th-fire' : getTh(firstDeck);

  const iw = document.getElementById('g-ico-wrap');
  iw.className = 'g-deck-ico ' + thClass;
  document.getElementById('g-ico').className  = 'fi ' + icoClass;
  document.getElementById('g-nm').textContent = selDeck.map(id => DB.decks.find(d => d.id === id)?.name).join(' x ');

  document.getElementById('res-ico-wrap').className = 'res-ico-wrap th-default';
  document.getElementById('res-ico').className = 'fi fi-sr-message-question';

  document.body.classList.add('in-game');
  
  history.pushState({ decks: selDeck }, '', '#play/' + selDeck.join('+'));
  
  _activeDeckIds = [...selDeck];
  selDeck = [];

  updRem();
  updateCr();
  setTimeout(() => renderCards(), 0);
}

function updRem() {
  const total = deckCards.length;
  const left  = Math.max(0, total - revCount);
  document.getElementById('g-rm').textContent = `เหลือ ${left}/${total} ใบ`;
}

function renderScatter() {
  const wrap   = document.getElementById('cards-wrap');
  wrap.innerHTML = '';

  const mobile    = isMobile();
  const isMulti   = _activeDeckIds.length > 1;
  const deck      = DB.decks.find(d => d.id === _activeDeckIds[0]) || DB.decks[0];
  const deckTheme = isMulti ? 'th-fire' : getTh(deck);
  const cardIcon  = isMulti ? 'fi-sr-message-question' : (deck?.icon || 'fi-sr-layers');

  const W = wrap.getBoundingClientRect().width || document.getElementById('game-screen').getBoundingClientRect().width || window.innerWidth - 32;
  const CW = mobile ? 72 : 96;
  const CH = mobile ? 104 : 138;
  const hdr  = document.querySelector('.game-hdr')?.offsetHeight || 80;
  const hint = document.querySelector('.cost-hint')?.offsetHeight || 48;
  const hdrH = hdr > 0 ? hdr : 80;
  const hntH = hint > 0 ? hint : 48;
  const H    = window.innerHeight - hdrH - hntH - 48;
  
  wrap.style.cssText = `width:100%;height:${H}px;position:relative;overflow:hidden;`;

  const ZX = mobile ? 6 : 7;
  const ZY = 5;
  const zW = W / ZX;
  const zH = H / ZY;

  const zones = [];
  for (let zy = 0; zy < ZY; zy++)
    for (let zx = 0; zx < ZX; zx++)
      zones.push([zx, zy]);
  for (let i = zones.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [zones[i], zones[j]] = [zones[j], zones[i]];
  }

  const frag = document.createDocumentFragment();
  const els  = [];

  displayCards.forEach((_, i) => {
    const [zx, zy] = zones[i % zones.length];
    const x   = zx * zW + Math.random() * Math.max(4, zW - CW);
    const y   = zy * zH + Math.random() * Math.max(4, zH - CH);
    const ang = (Math.random() - .5) * 100;
    const z   = Math.floor(Math.random() * displayCards.length) + 1;

    const el = document.createElement('div');
    el.className     = 'crd' + (mobile ? ' crd-sm' : '');
    el.dataset.i     = i;
    el.style.cssText = `left:${x}px;top:${y}px;transform:rotate(${ang}deg);z-index:${z};opacity:0;`;
    el.innerHTML     = `<div class="crd-back ${deckTheme}"><i class="fi ${cardIcon}"></i></div>`;
    el.onclick       = () => flipCard(el, i, ang);

    frag.appendChild(el);
    els.push(el);
  });
  wrap.appendChild(frag);

  const delay = mobile ? 5 : 10;
  els.forEach((el, i) => {
    setTimeout(() => {
      el.style.transition = 'all .25s cubic-bezier(.23,1,.32,1)';
      el.style.opacity    = '1';
    }, i * delay);
  });
}

function renderStack() {
  const wrap = document.getElementById('cards-wrap');
  wrap.innerHTML = '';
  wrap.style.cssText = 'min-height:420px;position:relative;';
  wrap.innerHTML = `
    <div class="stack-layout">
      <div class="stack-section stack-center">
        <div class="discard-label" style="justify-content:center;">
          <i class="fi fi-sr-layers" style="color:var(--text3);font-size:.8rem;"></i>กองไพ่
        </div>
        <div class="stack-pile-wrap" id="stack-pile-wrap"></div>
        <div class="stack-count" id="stack-count"></div>
      </div>
    </div>`;
  buildStackPile();
}
function buildStackPile() {
  const pileWrap = document.getElementById('stack-pile-wrap');
  const countEl  = document.getElementById('stack-count');
  if (!pileWrap) return;

  const isMulti   = _activeDeckIds.length > 1;
  const deck      = DB.decks.find(d => d.id === _activeDeckIds[0]) || DB.decks[0];
  const deckIcon  = isMulti ? 'fi-sr-message-question' : (deck?.icon || 'fi-sr-layers');
  const deckTheme = 'th-fire';

  const CW = Math.min(220, window.innerWidth * 0.58);
  const CH = Math.round(CW * 1.37);
  pileWrap.style.width   = (CW + 30) + 'px';
  pileWrap.style.height  = (CH + 30) + 'px';
  pileWrap.style.margin  = '0 auto';

  pileWrap.innerHTML = '';
  const remaining = deckCards.length - stackIndex;
  const left = Math.max(0, deckCards.length - revCount);
  if (countEl) countEl.textContent = left + ' ใบ';

  if (remaining <= 0) {
    pileWrap.innerHTML = `<div style="color:var(--text3);font-size:.85rem;text-align:center;padding:40px 16px;line-height:2;">
      <i class="fi fi-sr-check-circle" style="color:var(--red);display:block;font-size:2rem;margin-bottom:8px;"></i>หยิบครบแล้ว!</div>`;
    return;
  }

  const showCount = Math.min(remaining, 6);
  for (let i = showCount - 1; i >= 0; i--) {
    const el  = document.createElement('div');
    el.className = 'crd';
    const off = i * 3;
    const ang = (i - showCount / 2) * 1.8;
    el.style.cssText = `position:absolute;left:${off}px;top:${off}px;width:${CW}px;height:${CH}px;border-radius:14px;transform:rotate(${ang}deg);z-index:${showCount - i};`
      + (i === 0 ? 'cursor:pointer;box-shadow:0 0 28px var(--glow),3px 6px 18px rgba(0,0,0,.8);animation:pulse-card 2s ease-in-out infinite;' : 'cursor:default;');
    el.innerHTML = `<div class="crd-back ${deckTheme}" style="width:83%;height:86%;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:${Math.round(CW * 0.30)}px;color:var(--red);background:linear-gradient(135deg,rgba(26,5,5,0.6),rgba(45,8,8,0.6));border:1px solid rgba(229,9,20,.35);"><i class="fi ${deckIcon}"></i></div>`;
    if (i === 0) el.onclick = () => flipTopCard(el);
    pileWrap.appendChild(el);
  }
}

/* [FIX #5] flipTopCard ใช้ atomic deduction */
async function flipTopCard(el) {
  if (stackIndex >= deckCards.length) return;
  if (_flipLock) return;
  _flipLock = true;

  el.style.pointerEvents = 'none';
  el.onclick             = null;

  const cardData = deckCards[stackIndex];
  const deck = DB.decks.find(d => d.id === cardData?._deckId) || DB.decks.find(d => d.id === selDeck[0]);
  const cost = deck?.cost || 1;

  const { success, newBalance } = await API.deductCredits(cost);
  if (!success) {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) {
      toast('session หมดอายุ กรุณา login ใหม่', 'warning');
      openLogin();
      _flipLock = false;
      return;
    }
    toast(`เครดิตไม่พอ! ต้องใช้ ${cost} เครดิต`, 'error');
    openTopup();
    el.style.pointerEvents = '';
    el.onclick = () => flipTopCard(el);
    _flipLock = false;
    return;
  }

  credits = newBalance;
  updateCr();

  el.style.animation = '';
  el.classList.add('flipping');
  spawnSparks(el.getBoundingClientRect());
  if (navigator.vibrate) navigator.vibrate([30, 50, 80]);

  stackIndex++;
  revCount++;
  updRem();

  setTimeout(() => {
    el.classList.remove('flipping');
    el.classList.add('revealed');
    el.innerHTML = `<div class="crd-revealed-inner">
      <i class="fi fi-sr-check" style="color:var(--red);font-size:.7rem;"></i>
      <div class="crd-cat">${esc(cardData.cat)}</div>
      <div class="crd-txt">${esc(cardData.text.length > 30 ? cardData.text.slice(0, 28) + '…' : cardData.text)}</div>
    </div>`;

    setTimeout(() => {
      el.style.transition = 'opacity .4s ease, transform .4s ease';
      el.style.opacity    = '0';
      el.style.transform  = 'scale(0.6)';
      setTimeout(() => el.remove(), 420);
    }, 300);

    buildStackPile();
    _flipLock = false;
    setTimeout(() => showRes(cardData, deck), 200);
  }, 560);
}


function renderCards() {
  layoutMode === 'stack' ? renderStack() : renderScatter();
}

/* [FIX #5] flipCard ใช้ atomic deduction
   [FIX #13] แก้ index bug หลัง batch reload */
async function flipCard(el, idx, ang) {
  if (el.classList.contains('revealed') || el.classList.contains('flipping')) return;
  if (_flipLock) return;
  _flipLock = true;

  el.style.pointerEvents = 'none';
  el.onclick             = null;

  const card = displayCards[idx];
  if (!card) { _flipLock = false; return; }

  const deck = DB.decks.find(d => d.id === card?._deckId) || DB.decks.find(d => d.id === selDeck[0]);
  const cost = deck?.cost || 1;

  const { success, newBalance } = await API.deductCredits(cost);
  if (!success) {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) {
      toast('session หมดอายุ กรุณา login ใหม่', 'warning');
      openLogin();
      _flipLock = false;
      return;
    }
    toast(`เครดิตไม่พอ! ต้องใช้ ${cost} เครดิต`, 'error');
    openTopup();
    el.style.pointerEvents = '';
    el.onclick = () => flipCard(el, idx, ang);
    _flipLock = false;
    return;
  }

  credits = newBalance;
  updateCr();

  el.classList.add('flipping');
  spawnSparks(el.getBoundingClientRect());
  if (navigator.vibrate) navigator.vibrate([30, 50, 80]);

  setTimeout(() => {
    el.classList.remove('flipping');
    el.classList.add('revealed');
    el.style.transform = `rotate(${ang}deg)`;
    el.style.zIndex    = '200';
    el.innerHTML = `<div class="crd-revealed-inner">
      <i class="fi fi-sr-check" style="color:var(--red);font-size:.8rem;"></i>
      <div class="crd-cat">${esc(card.cat)}</div>
      <div class="crd-txt">${esc(card.text.length > 42 ? card.text.slice(0, 39) + '…' : card.text)}</div>
    </div>`;
    revCount++;
    updRem();
    _flipLock = false;
    setTimeout(() => showRes(card, deck), 200);

    setTimeout(() => {
      el.style.transition = 'opacity .4s ease, transform .4s ease';
      el.style.opacity    = '0';
      el.style.transform  = `scale(0.6) rotate(${ang}deg)`;
      setTimeout(() => el.remove(), 420);
    }, 800);

    // [FIX #13] นับจาก DOM จริง และ re-render scatter ใหม่ทั้งหมดเพื่อ reset index
    const remaining = document.querySelectorAll('.crd:not(.revealed)').length;
    if (remaining < RELOAD_THRESHOLD && usedIndices.size < deckCards.length) {
      const nextBatch = loadNextBatch();
      if (nextBatch.length > 0) {
        // เก็บ card data ที่ยังอยู่บน screen ก่อน re-render
        const onScreenCards = [...document.querySelectorAll('.crd:not(.revealed):not(.flipping)')]
          .map(e => displayCards[parseInt(e.dataset.i)])
          .filter(Boolean);
        // rebuild displayCards และ re-render ทั้งหมด (reset index ให้ถูกต้อง)
        displayCards = [...onScreenCards, ...nextBatch];
        setTimeout(() => {
          renderScatter();
          toast(`โหลดไพ่เพิ่ม ${nextBatch.length} ใบ`, 'info');
        }, 300);
      }
    }
  }, 560);
}

function showRes(card, deck) {
  _addToHistory(card, deck);
  const th = getTh(deck);
  document.getElementById('res-dlbl').innerHTML    = `<i class="fi ${esc(deck.icon || 'fi-sr-layers')}" style="color:var(--red);"></i> ${esc(deck.name)}`;
  document.getElementById('res-ico-wrap').className = `res-ico-wrap ${th}`;
  document.getElementById('res-ico').className      = `fi ${esc(deck.icon || 'fi-sr-flame')}`;
  document.getElementById('res-cat').textContent    = card.cat;
  document.getElementById('res-txt').textContent    = card.text;
  document.getElementById('res-overlay').classList.add('show');
}

function closeRes() {
  document.getElementById('res-overlay').classList.remove('show');
}

window.addEventListener('popstate', e => {
  const hash = window.location.hash;
  if (hash === '#admin' || hash.startsWith('#admin/')) {
    showAdmin();
  } else if (hash.startsWith('#play/')) {
    const ids = hash.replace('#play/', '').split('+').filter(Boolean);
    _restoreGame(ids);
  } else {
    document.getElementById('game-screen').style.display  = 'none';
    document.getElementById('home-screen').style.display  = '';
    document.getElementById('admin-screen').style.display = 'none';
    document.body.classList.remove('in-game');
    selDeck = [];
    renderDecks();
  }
});

/* restore game จาก URL เช่น refresh หรือ back/forward */
async function _restoreGame(deckIds) {
  if (!deckIds?.length) { goHome(); return; }

  // ถ้า DB ยังไม่โหลด รอก่อน
  if (!DB.decks.length) await initDB();

  // กรองเฉพาะ deck ที่มีจริงและไม่ถูกซ่อน
  const validIds = deckIds.filter(id => DB.decks.find(d => d.id === id && !d.hidden));
  if (!validIds.length) { goHome(); toast('ไม่พบกองไพ่นี้แล้ว', 'warning'); return; }

  selDeck = validIds;
  renderDecks(); // sync ไฮไลต์ deck ที่ home
  await startGame();
}

function loadNextBatch() {
  const available = deckCards.map((_, i) => i).filter(i => !usedIndices.has(i));
  const take = available.slice(0, DISPLAY_BATCH);
  take.forEach(i => usedIndices.add(i));
  return take.map(i => deckCards[i]);
// <<<<<<< HEAD
}
// =======
// }
// >>>>>>> 35c8474b63db1f7722e0f8c3738916b5f76e4a23

/* ============================================
   CARD HISTORY — ประวัติไพ่ที่เปิดไปแล้ว
   ============================================ */
function _addToHistory(card, deck) {
  cardHistory.unshift({ card, deck, time: Date.now() });
  _updateHistBadge();
  // ถ้า drawer เปิดอยู่ให้ re-render ทันที
  if (document.getElementById('hist-drawer')?.classList.contains('show')) {
    _renderHistDrawer();
  }
}

function _updateHistBadge() {
  const badge = document.getElementById('hist-badge');
  const btn   = document.getElementById('btn-history');
  if (!badge || !btn) return;
  const n = cardHistory.length;
  badge.textContent = n > 99 ? '99+' : n;
  badge.style.display = n > 0 ? 'flex' : 'none';
}

function _renderHistDrawer() {
  const body    = document.getElementById('hist-drawer-body');
  const countEl = document.getElementById('hist-drawer-count');
  if (!body) return;
  if (countEl) countEl.textContent = cardHistory.length;

  if (!cardHistory.length) {
    body.innerHTML = `<div class="hist-empty">
      <i class="fi fi-sr-layers"></i>
      ยังไม่ได้เปิดไพ่ใบไหน
    </div>`;
    return;
  }

  body.innerHTML = cardHistory.map((h, i) => {
    const th = getTh(h.deck);
    return `
    <div class="hist-item">
      <span class="hist-item-num">${cardHistory.length - i}</span>
      <div class="hist-item-ico ${th}">
        <i class="fi ${esc(h.deck.icon || 'fi-sr-layers')}"></i>
      </div>
      <div class="hist-item-info">
        <div class="hist-item-cat">${esc(h.card.cat)}</div>
        <div class="hist-item-txt">${esc(h.card.text)}</div>
        <div class="hist-item-deck">${esc(h.deck.name)}</div>
      </div>
    </div>`;
  }).join('');
}

function openHistDrawer() {
  _renderHistDrawer();
  document.getElementById('hist-drawer-overlay')?.classList.add('show');
  document.getElementById('hist-drawer')?.classList.add('show');
}

function closeHistDrawer() {
  document.getElementById('hist-drawer-overlay')?.classList.remove('show');
  document.getElementById('hist-drawer')?.classList.remove('show');
}

/* ============================================
   TOUCH PICKER — สุ่มผู้เล่น
   ============================================ */

let _touchDots    = {};
let _cdTimer      = null;
let _cdValue      = 0;
let _pickDone     = false;

function openTouchPicker() {
  window._savedSelDeck = [...selDeck]; // snapshot ไว้ก่อน
  document.documentElement.style.touchAction = 'none';
  document.body.style.touchAction = 'none';
  document.body.style.overflow    = 'hidden';

  const ov = document.getElementById('touch-picker-ov');
  ov.style.cssText = 'display:block !important; position:fixed; inset:0; background:#000; z-index:800;';

  _touchDots = {};
  _pickDone  = false;
  _clearTouchCountdown();

  document.getElementById('touch-dots-wrap').innerHTML = '';
  document.getElementById('touch-countdown').style.display = 'none';
  document.getElementById('touch-instruction').classList.remove('hide');
  document.getElementById('touch-msg').textContent = 'วางนิ้ว 2-6 คนพร้อมกันบนหน้าจอ';

  const area = document.getElementById('touch-area');
  area.style.cssText = 'width:100%;height:100vh;position:relative;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;';

  const closeBtn = document.getElementById('touch-close-btn');
  closeBtn.ontouchend = (e) => { e.stopPropagation(); e.preventDefault(); closeTouchPicker(); };
  closeBtn.onclick    = (e) => { e.stopPropagation(); closeTouchPicker(); }; // ← เพิ่ม

  area.removeEventListener('touchstart',  _onTouchStart);
  area.removeEventListener('touchend',    _onTouchEnd);
  area.removeEventListener('touchcancel', _onTouchEnd);
  area.removeEventListener('touchmove',   _onTouchMove);
  area.removeEventListener('mousedown',   _onMouseDown); // ← เพิ่ม
  area.removeEventListener('mouseup',     _onMouseUp);   // ← เพิ่ม
  area.removeEventListener('mousemove', _onMouseMove);
  area.addEventListener('mousemove', _onMouseMove);

  area.addEventListener('touchstart',  _onTouchStart,  { passive: false });
  area.addEventListener('touchend',    _onTouchEnd,    { passive: false });
  area.addEventListener('touchcancel', _onTouchEnd,    { passive: false });
  area.addEventListener('touchmove',   _onTouchMove,   { passive: false });
  area.addEventListener('mousedown',   _onMouseDown);  // ← เพิ่ม
  area.addEventListener('mouseup',     _onMouseUp);    // ← เพิ่ม
  area.removeEventListener('mousemove', _onMouseMove);
  area.addEventListener('mousemove', _onMouseMove);
}

function closeTouchPicker() {
  document.documentElement.style.touchAction = '';
  document.body.style.touchAction = '';
  document.body.style.overflow    = '';

  const ov   = document.getElementById('touch-picker-ov');
  const area = document.getElementById('touch-area');
  ov.classList.remove('show', 'picking');
  ov.style.display = 'none';
  _clearTouchCountdown();
  _touchDots = {};
  _pickDone  = false;

  area.removeEventListener('touchstart',  _onTouchStart);
  area.removeEventListener('touchend',    _onTouchEnd);
  area.removeEventListener('touchcancel', _onTouchEnd);
  area.removeEventListener('touchmove',   _onTouchMove);
  area.removeEventListener('mousedown',   _onMouseDown); // ← เพิ่ม
  area.removeEventListener('mouseup',     _onMouseUp);   // ← เพิ่ม
  area.removeEventListener('mousemove', _onMouseMove);
}

function _onMouseUp(e) {
  if (_pickDone) return;

  const id  = 'mouse_' + e.button;
  const dot = _touchDots[id];
  if (dot) {
    dot.el.classList.remove('show');
    setTimeout(() => dot.el.remove(), 200);
    delete _touchDots[id];
  }

  if (Object.keys(_touchDots).length === 0) _clearTouchCountdown();
  _updateAfterTouch();
}

// ← ฟังก์ชันใหม่ทั้งสองตัว
function _onMouseDown(e) {
  if (e.target.closest('#touch-close-btn')) return;
  if (_pickDone) return;

  const id = 'mouse_' + e.button; // ใช้ button number เป็น identifier
  if (_touchDots[id] !== undefined) return;
  if (Object.keys(_touchDots).length >= 6) return;

  const idx = Object.keys(_touchDots).length;
  const el  = document.createElement('div');
  el.className   = `touch-dot touch-dot-${idx}`;
  el.style.left  = e.clientX + 'px';
  el.style.top   = e.clientY + 'px';
  el.textContent = idx + 1;
  document.getElementById('touch-dots-wrap').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  _touchDots[id] = { x: e.clientX, y: e.clientY, el, idx };

  _updateAfterTouch();
}


function _onTouchStart(e) {
  if (e.target.closest('#touch-close-btn')) return;
  e.preventDefault();
  if (_pickDone) return;

  for (const t of e.touches) {
    if (Object.keys(_touchDots).length >= 6) break;
    if (_touchDots[t.identifier] !== undefined) continue;

    const idx = Object.keys(_touchDots).length;
    const el  = document.createElement('div');
    el.className   = `touch-dot touch-dot-${idx}`;
    el.style.left  = t.clientX + 'px';
    el.style.top   = t.clientY + 'px';
    el.textContent = idx + 1;
    document.getElementById('touch-dots-wrap').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    _touchDots[t.identifier] = { x: t.clientX, y: t.clientY, el, idx };
  }

  _updateAfterTouch();
}

function _onTouchEnd(e) {
  e.preventDefault();
  if (_pickDone) return;

  for (const t of e.changedTouches) {
    const dot = _touchDots[t.identifier];
    if (dot) {
      dot.el.classList.remove('show');
      setTimeout(() => dot.el.remove(), 200);
      delete _touchDots[t.identifier];
    }
  }

  // clear countdown เฉพาะเมื่อไม่มีนิ้วเหลือ
  if (Object.keys(_touchDots).length === 0) _clearTouchCountdown();
  _updateAfterTouch();
}

function _onTouchMove(e) {
  if (e.cancelable) e.preventDefault();
  if (_pickDone) return;

  for (const t of e.changedTouches) {
    const dot = _touchDots[t.identifier];
    if (dot) {
      dot.el.style.left = t.clientX + 'px';
      dot.el.style.top  = t.clientY + 'px';
      dot.x = t.clientX;
      dot.y = t.clientY;
    }
  }
}

function _onMouseMove(e) {
  if (_pickDone) return;
  const dot = _touchDots['mouse_0'];
  if (dot) {
    dot.el.style.left = e.clientX + 'px';
    dot.el.style.top  = e.clientY + 'px';
    dot.x = e.clientX;
    dot.y = e.clientY;
  }
}

function _updateAfterTouch() {
  const count = Object.keys(_touchDots).length;
  const msg   = document.getElementById('touch-msg');
  const inst  = document.getElementById('touch-instruction');
  const warn  = document.getElementById('touch-warning');

  if (warn) warn.remove();

  if (count === 0) {
    inst?.classList.remove('hide');
    if (msg) msg.textContent = 'วางนิ้ว 2-6 คนพร้อมกันบนหน้าจอ';
    _clearTouchCountdown();
    return;
  }

  if (count < 1) { // ← เปลี่ยนกลับเป็น 2 เมื่อเทสเสร็จ
    inst?.classList.remove('hide');
    if (msg) msg.textContent = 'ต้องการอย่างน้อย 2 คน!';
    _clearTouchCountdown();
    const w = document.createElement('div');
    w.id = 'touch-warning';
    w.innerHTML = '<i class="fi fi-sr-exclamation"></i> ต้องการอย่างน้อย 2 นิ้ว';
    document.getElementById('touch-area').appendChild(w);
    setTimeout(() => w?.remove(), 1800);
    return;
  }

  inst?.classList.add('hide');
  if (!_cdTimer) _startTouchCountdown(count);
}

function _startTouchCountdown(playerCount) {
  _cdValue = 3;
  const cdEl = document.getElementById('touch-countdown');
  if (!cdEl) return;
  cdEl.style.display = 'flex';
  cdEl.textContent   = _cdValue;

  _cdTimer = setInterval(() => {
    _cdValue--;
    if (_cdValue <= 0) {
      _clearTouchCountdown();
      _doPick();
    } else {
      cdEl.textContent = _cdValue;
    }
  }, 1000);
}

function _clearTouchCountdown() {
  clearInterval(_cdTimer);
  _cdTimer = null;
  const cdEl = document.getElementById('touch-countdown');
  if (cdEl) cdEl.style.display = 'none';
}

async function _doPick() {
  if (_pickDone) return;
  _pickDone = true;

  const keys = Object.keys(_touchDots);
  if (keys.length < 1) { // ← เปลี่ยนกลับเป็น 2 เมื่อเทสเสร็จ
    _pickDone = false;
    _updateAfterTouch();
    return;
  }

  const deck = DB.decks.find(d => d.id === _activeDeckIds[0]);
  const cost = deck?.cost || 1;
  const { success, newBalance } = await API.deductCredits(cost);

  if (!success) {
    toast(`เครดิตไม่พอ! ต้องใช้ ${cost} เครดิต`, 'error');
    openTopup();
    _pickDone = false;
    return;
  }

  credits = newBalance;
  updateCr();

  // flash animation
  let flashCount = 0;
  const maxFlash = 12;
  const dotList  = keys.map(k => _touchDots[k]);
  let   flashIdx = 0;

  const flashTimer = setInterval(() => {
    dotList.forEach(d => {
      d.el.style.boxShadow = '';
      d.el.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    const curr = dotList[flashIdx % dotList.length];
    curr.el.style.boxShadow = '0 0 40px #fff, 0 0 80px var(--glow)';
    curr.el.style.transform = 'translate(-50%, -50%) scale(1.2)';
    setTimeout(() => {
      if (curr.el) curr.el.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 80);

    flashIdx++;
    flashCount++;

    if (flashCount >= maxFlash) {
      clearInterval(flashTimer);

      // ← overlay มืดลง
      document.getElementById('touch-picker-ov').classList.add('picking');

      const pickedKey = keys[Math.floor(Math.random() * keys.length)];
      const picked    = _touchDots[pickedKey];

      // reset glow จาก flash
      dotList.forEach(d => {
        d.el.style.boxShadow = '';
        d.el.style.transform = '';
      });

      // หน่วงให้ overlay มืดก่อน แล้วค่อย highlight
      setTimeout(() => {
        dotList.forEach(d => {
          if (d === picked) {
            d.el.classList.add('picked');
            const lbl = document.createElement('div');
            lbl.className   = 'touch-dot-result';
            lbl.textContent = 'คนนี้แหละ!';
            d.el.appendChild(lbl);
          } else {
            d.el.classList.add('not-picked');
          }
        });
      }, 300);

      // ดึงไพ่มาแสดง
      setTimeout(() => {
        const allCards = _activeDeckIds.flatMap(id => (DB.cards[id] || []).map(c => ({ ...c, _deckId: id })));
        if (allCards.length) {
          const card = allCards[Math.floor(Math.random() * allCards.length)];
          const d    = DB.decks.find(x => x.id === card._deckId) || deck;

          revCount++;
          updRem();
          closeTouchPicker();
          showRes(card, d);
              const origCloseRes = window.closeRes;

          window.closeRes = function() {
            origCloseRes();
            window.closeRes = origCloseRes; // restore กลับ
            setTimeout(() => openTouchPicker(), 300);
          };
        } else {
          toast('ไม่มีไพ่ในกองที่เลือก', 'warning');
          closeTouchPicker();
        }
      }, 1800);
    }
  }, 120);
}
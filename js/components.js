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
  document.getElementById('btn-admin').style.display = 'none';
  history.pushState({ deck: selDeck[0] }, '', '#play/' + selDeck[0]);

  updRem();
  updateCr();
  renderCards();
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
  const isMulti   = selDeck.length > 1;
  const deck      = DB.decks.find(d => d.id === selDeck[0]) || DB.decks[0];
  const deckTheme = isMulti ? 'th-fire' : getTh(deck);
  const cardIcon  = isMulti ? 'fi-sr-message-question' : (deck?.icon || 'fi-sr-layers');

  const W  = wrap.getBoundingClientRect().width || window.innerWidth - 32;
  const CW = mobile ? 72 : 96;
  const CH = mobile ? 104 : 138;
  const hdr  = document.querySelector('.game-hdr')?.getBoundingClientRect().height || 80;
  const hint = document.querySelector('.cost-hint')?.getBoundingClientRect().height || 48;
  const H    = window.innerHeight - hdr - hint - 48;

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
    const ang = (Math.random() - .5) * 72;
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

  const isMulti   = selDeck.length > 1;
  const deck      = DB.decks.find(d => d.id === selDeck[0]) || DB.decks[0];
  const deckIcon  = isMulti ? 'fi-sr-message-question' : (deck?.icon || 'fi-sr-layers');
  const deckTheme = isMulti ? 'th-fire' : getTh(deck);

  pileWrap.innerHTML = '';
  const remaining = deckCards.length - stackIndex;
  if (countEl) countEl.textContent = remaining + ' ใบ';

  if (remaining <= 0) {
    pileWrap.innerHTML = `<div style="color:var(--text3);font-size:.85rem;text-align:center;padding:40px 16px;line-height:2;">
      <i class="fi fi-sr-check-circle" style="color:var(--red);display:block;font-size:2rem;margin-bottom:8px;"></i>หยิบครบแล้ว!</div>`;
    return;
  }

  const showCount = Math.min(remaining, 6);
  for (let i = showCount - 1; i >= 0; i--) {
    const el  = document.createElement('div');
    el.className = 'crd stack-crd';
    const off = i * 2.5;
    const ang = (i - showCount / 2) * 1.8;
    el.style.cssText = `position:absolute;left:${off}px;top:${off}px;transform:rotate(${ang}deg);z-index:${showCount - i};`
      + (i === 0 ? 'cursor:pointer;box-shadow:0 0 22px var(--glow),3px 6px 18px rgba(0,0,0,.8);animation:pulse-card 2s ease-in-out infinite;' : 'cursor:default;');
    el.innerHTML = `<div class="crd-back ${deckTheme}"><i class="fi ${deckIcon}"></i></div>`;
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
  if (hash === '#admin') {
    showAdmin();
  } else if (!e.state?.deck) {
    document.getElementById('game-screen').style.display  = 'none';
    document.getElementById('home-screen').style.display  = '';
    document.getElementById('admin-screen').style.display = 'none';
    document.body.classList.remove('in-game');
    document.getElementById('btn-admin').style.display    = '';
    // [FIX] reset selDeck เพื่อไม่ให้ค้างจาก session ก่อน
    selDeck = [];
    renderDecks();
  }
});

function loadNextBatch() {
  const available = deckCards.map((_, i) => i).filter(i => !usedIndices.has(i));
  const take = available.slice(0, DISPLAY_BATCH);
  take.forEach(i => usedIndices.add(i));
  return take.map(i => deckCards[i]);
}
/* =========================================
   admin.js — Admin Panel Logic
   ========================================= */

let editDeckId = null;

/* ---- TABS ---- */
function switchTab(name, idx) {
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('act', i === idx));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('act'));
  const target = document.getElementById('tc-' + name);
  if (target) target.classList.add('act');

  if (name === 'users')    loadUserTab();
  if (name === 'stats')    loadStatsTab();
  if (name === 'history')  loadHistoryTab();
  if (name === 'announce') loadAnnounceTab();
}

/* ---- TAB LOADERS ---- */
async function loadUserTab() {
  const container = document.getElementById('tc-users');
  if (!container) return;
  if (typeof loadAdminUserList === 'function') await loadAdminUserList();
}

async function loadStatsTab() {
  const container = document.getElementById('tc-stats');
  if (!container) return;
  const totalUsers = document.getElementById('stat-users');
  if (totalUsers) {
    const users = await API.getAllUsers();
    totalUsers.textContent = users.length;
  }
  renderAdmDecks();
}

async function loadHistoryTab() {
  const container = document.getElementById('tc-history');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text3);font-size:.85rem;">กำลังโหลด...</p>';

  const { data, error } = await _sb
    .from('credit_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data?.length) {
    container.innerHTML = '<p style="color:var(--text3);">ไม่พบประวัติ</p>';
    return;
  }

  container.innerHTML = data.map(h => `
    <div class="drow" style="font-size:.85rem;">
      <div class="drow-info" style="gap:10px;">
        <div>
          <div style="color:var(--text1);">${h.note || h.type}</div>
          <div style="color:var(--text3);font-size:.75rem;">${new Date(h.created_at).toLocaleString('th-TH')}</div>
        </div>
      </div>
      <div style="color:${h.amount > 0 ? 'var(--gold)' : 'var(--red)'}; font-weight:600;">
        ${h.amount > 0 ? '+' : ''}${h.amount} เครดิต
      </div>
    </div>`).join('');
}

async function loadAnnounceTab() {
  const container = document.getElementById('tc-announce');
  if (!container) return;
  const listEl = document.getElementById('announce-list');
  if (!listEl) return;

  listEl.innerHTML = '<p style="color:var(--text3);font-size:.85rem;">กำลังโหลด...</p>';

  const { data, error } = await _sb
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data?.length) {
    listEl.innerHTML = '<p style="color:var(--text3);">ไม่พบประกาศ</p>';
    return;
  }

  listEl.innerHTML = data.map(a => `
    <div class="drow">
      <div class="drow-info">
        <div>
          <div class="drow-nm">${a.title || '(ไม่มีชื่อ)'}</div>
          <div class="drow-meta">
            <span class="tag">${a.type || 'info'}</span>
            <span class="tag" style="color:${a.active ? 'var(--gold)' : 'var(--text3)'};">
              ${a.active ? 'เผยแพร่อยู่' : 'ซ่อนอยู่'}
            </span>
          </div>
        </div>
      </div>
      <div class="drow-acts">
        <button class="btn-sm btn-edit" onclick="toggleAnnounce('${a.id}', ${!a.active})">
          <i class="fi fi-sr-eye${a.active ? '-crossed' : ''}"></i>
          ${a.active ? 'ซ่อน' : 'เผยแพร่'}
        </button>
      </div>
    </div>`).join('');
}

async function toggleAnnounce(id, active) {
  const { error } = await _sb.from('announcements').update({ active }).eq('id', id);
  if (error) { toast('เกิดข้อผิดพลาด', 'error'); return; }
  toast(active ? 'เผยแพร่ประกาศแล้ว' : 'ซ่อนประกาศแล้ว', 'success');
  loadAnnounceTab();
}

/* ---- DECK LIST ---- */
function renderAdmDecks() {
  const deckEl = document.getElementById('stat-decks');
  const cardEl = document.getElementById('stat-cards');
  if (deckEl) deckEl.textContent = DB.decks.filter(d => !d.hidden).length;
  if (cardEl) cardEl.textContent = Object.values(DB.cards).reduce((s, arr) => s + arr.length, 0).toLocaleString();
  const l = document.getElementById('adm-deck-list');
  l.innerHTML = '';
  DB.decks.forEach(d => {
    const cnt = (DB.cards[d.id] || []).length;
    const th  = getTh(d);
    const r   = document.createElement('div');
    r.className = 'drow';
    r.innerHTML = `
    <div class="drow-info">
      <div class="drow-ico ${th}"><i class="fi ${d.icon || 'fi-sr-layers'}"></i></div>
      <div>
        <div class="drow-nm">${d.name}</div>
        <div class="drow-meta">
          <span class="tag"><i class="fi fi-rr-copy" style="font-size:.7rem;"></i> ${cnt} ใบ</span>
          <span class="tag" style="color:var(--gold);"><i class="fi fi-sr-coins" style="font-size:.7rem;"></i> ${d.cost || 1}/ใบ</span>
          ${d.desc ? `<span style="color:var(--text3);">${d.desc}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="drow-acts">
      <button class="btn-sm ${d.hidden ? 'btn-hidden' : 'btn-visible'}" onclick="toggleDeck('${d.id}')">
        <i class="fi ${d.hidden ? 'fi-sr-eye-crossed' : 'fi-sr-eye'}"></i>
        ${d.hidden ? 'ซ่อนอยู่' : 'แสดงอยู่'}
      </button>
      <button class="btn-sm btn-edit" onclick="editDeck('${d.id}')"><i class="fi fi-sr-edit"></i> แก้ไข</button>
      <button class="btn-sm btn-del"  onclick="delDeck('${d.id}')"><i class="fi fi-sr-trash"></i> ลบ</button>
    </div>`;
    l.appendChild(r);
  });
}

function renderAdmSel() {
  const s = document.getElementById('adm-deck-sel');
  s.innerHTML = '<option value="">-- เลือกกองไพ่ --</option>';
  DB.decks.forEach(d => {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = d.name;
    s.appendChild(o);
  });
}

/* ---- DECK FORM ---- */
function openDeckForm(id) {
  editDeckId = id || null;
  if (id) {
    const d = DB.decks.find(x => x.id === id);
    document.getElementById('df-title').innerHTML = `<i class="fi fi-sr-edit" style="color:var(--red);"></i> แก้ไขกองไพ่`;
    document.getElementById('df-name').value     = d.name;
    document.getElementById('df-icon').value     = d.icon  || 'fi-sr-flame';
    document.getElementById('df-theme').value    = d.theme || 'default';
    document.getElementById('df-desc').value     = d.desc  || '';
    document.getElementById('df-cost').value     = d.cost  || 1;
    document.getElementById('df-category').value = d.category || '';
  } else {
    document.getElementById('df-title').innerHTML = `<i class="fi fi-sr-layers" style="color:var(--red);"></i> เพิ่มกองไพ่ใหม่`;
    ['df-name', 'df-desc', 'df-category'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('df-icon').value  = 'fi-sr-flame';
    document.getElementById('df-theme').value = 'fire';
    document.getElementById('df-cost').value  = '1';
  }
  document.getElementById('deck-form-ov').classList.add('show');
}

function closeDeckForm() { document.getElementById('deck-form-ov').classList.remove('show'); }
function editDeck(id)    { openDeckForm(id); }

function saveDeck() {
  const name = document.getElementById('df-name').value.trim();
  if (!name) { toast('กรุณาใส่ชื่อกองไพ่', 'warning'); return; }
  const icon     = document.getElementById('df-icon').value.trim()     || 'fi-sr-flame';
  const theme    = document.getElementById('df-theme').value            || 'default';
  const desc     = document.getElementById('df-desc').value.trim();
  const cost     = parseInt(document.getElementById('df-cost').value)   || 1;
  const category = document.getElementById('df-category').value.trim() || '';

  if (editDeckId) {
    const d = DB.decks.find(x => x.id === editDeckId);
    Object.assign(d, { name, icon, theme, desc, cost, category });
  } else {
    const id = 'd' + Date.now();
    DB.decks.push({ id, name, icon, theme, desc, cost, category });
    DB.cards[id] = [];
  }
  saveDB(); closeDeckForm(); renderAdmDecks(); renderAdmSel();
  toast('บันทึกกองไพ่แล้ว', 'success');
}

function delDeck(id) {
  if (!confirm('ลบกองไพ่นี้? ไพ่ทั้งหมดจะหายด้วย')) return;
  DB.decks   = DB.decks.filter(d => d.id !== id);
  delete DB.cards[id];
  saveDB(); renderAdmDecks(); renderAdmSel();
  toast('ลบกองไพ่แล้ว', 'info');
}

/* ---- CARD EDITOR ---- */
function loadCE() {
  const id = document.getElementById('adm-deck-sel').value;
  const ed = document.getElementById('card-list-ed');
  if (!id) {
    ed.innerHTML = '';
    document.getElementById('ce-title').innerHTML = '<i class="fi fi-sr-layers" style="color:var(--red);"></i> เลือกกองไพ่ก่อน';
    return;
  }
  const d = DB.decks.find(x => x.id === id);
  document.getElementById('ce-title').innerHTML = `<i class="fi ${d.icon || 'fi-sr-layers'}" style="color:var(--red);"></i> ${d.name} — แก้ไขไพ่`;
  ed.innerHTML = '';
  (DB.cards[id] || []).forEach(c => addCRow(c.text, c.cat));
}

function addCRow(text = '', cat = '') {
  const ed = document.getElementById('card-list-ed');
  const r  = document.createElement('div');
  r.className = 'ced-row';
  r.innerHTML = `
    <i class="fi fi-sr-tag" style="color:var(--text3);font-size:.78rem;flex-shrink:0;"></i>
    <input class="ci" type="text" value="${cat.replace(/"/g, '&quot;')}" placeholder="หมวด">
    <input type="text" value="${text.replace(/"/g, '&quot;')}" placeholder="ข้อความในไพ่...">
    <button class="del-btn" onclick="this.parentElement.remove()"><i class="fi fi-sr-cross"></i></button>`;
  ed.appendChild(r);
  r.querySelector('input:last-of-type').focus();
}

function saveCards() {
  const id = document.getElementById('adm-deck-sel').value;
  if (!id) { toast('เลือกกองไพ่ก่อน', 'warning'); return; }
  const rows = document.querySelectorAll('#card-list-ed .ced-row');
  DB.cards[id] = [];
  rows.forEach(r => {
    const ins  = r.querySelectorAll('input');
    const cat  = ins[0].value.trim() || 'ทั่วไป';
    const text = ins[1].value.trim();
    if (text) DB.cards[id].push({ cat, text });
  });
  saveDB();
  toast(`บันทึก ${DB.cards[id].length} ใบแล้ว`, 'success');
  renderAdmDecks();
}

/* ---- SETTINGS ---- */
function saveSettings() {
  DB.settings.startCredit  = parseInt(document.getElementById('st-cr').value)   || 10;
  DB.settings.siteName     = document.getElementById('st-nm').value             || 'DRINKORDOOM';
  DB.settings.testMode     = parseInt(document.getElementById('st-test').value);
  DB.settings.showModal    = parseInt(document.getElementById('st-modal').value);
  DB.settings.defaultCost  = parseInt(document.getElementById('st-cost').value) || 1;
  DB.settings.topupEnabled = parseInt(document.getElementById('st-topup').value);
  saveDB(); applyTestMode();
  toast('บันทึกการตั้งค่าแล้ว', 'success');
}

// [FIX] connectSheet นิยามครั้งเดียวที่นี่ — ลบออกจาก api.js แล้ว
function connectSheet() {
  const url = document.getElementById('sheet-url')?.value?.trim();
  if (!url) { toast('กรุณาใส่ URL', 'warning'); return; }

  API.setSheetUrl(url);
  toast('กำลังดึงข้อมูล...', 'info');

  API.syncFromSheets(url)
    .then(({ decks, cards }) => {
      toast(`โหลดสำเร็จ! ${decks} กอง, ${cards} ใบ`, 'success');
      renderAdmDecks();
      renderAdmSel();
      renderDecks();
    })
    .catch(() => toast('เชื่อมต่อไม่ได้ — ตรวจสอบ URL และ Share settings', 'error'));
}

/* ---- EXPORT / IMPORT ---- */
function exportData() {
  const b = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = 'dealshot_data.json'; a.click();
}
function importData() { document.getElementById('imp-file').click(); }

/* [FIX #6] validate JSON structure ก่อน import */
function handleImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const parsed = JSON.parse(ev.target.result);

      // validate required fields
      if (!parsed || typeof parsed !== 'object') throw new Error('ไม่ใช่ JSON object');
      if (!Array.isArray(parsed.decks))          throw new Error('decks ต้องเป็น array');
      if (typeof parsed.cards !== 'object')      throw new Error('cards ต้องเป็น object');

      // validate deck structure
      for (const d of parsed.decks) {
        if (!d.id || typeof d.id !== 'string')   throw new Error(`deck ไม่มี id`);
        if (!d.name || typeof d.name !== 'string') throw new Error(`deck ${d.id} ไม่มี name`);
      }

      // validate cards structure
      for (const [deckId, cards] of Object.entries(parsed.cards)) {
        if (!Array.isArray(cards)) throw new Error(`cards[${deckId}] ต้องเป็น array`);
        for (const c of cards) {
          if (typeof c.text !== 'string') throw new Error(`card ใน ${deckId} ไม่มี text`);
        }
      }

      DB = parsed;
      saveDB();
      renderAdmDecks();
      renderAdmSel();
      toast('Import สำเร็จ', 'success');
    } catch (err) {
      toast(`ไฟล์ไม่ถูกต้อง: ${err.message}`, 'error');
    }
  };
  r.readAsText(f);
  // reset file input เพื่อให้ import ไฟล์เดิมซ้ำได้
  e.target.value = '';
}
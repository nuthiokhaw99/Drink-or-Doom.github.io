/* =========================================
   admin.js — Admin Panel Logic
   ========================================= */

let editDeckId = null;

/* ---- TABS ---- */
function switchTab(name, idx) {
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('act', i === idx));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('act'));
  document.getElementById('tc-' + name).classList.add('act');
}

/* ---- DECK LIST ---- */
function renderAdmDecks() {
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
    o.value       = d.id;
    o.textContent = d.name;
    s.appendChild(o);
  });
}

/* ---- DECK FORM ---- */
function openDeckForm(id) {
  editDeckId = id || null;
  if (id) {
    const d = DB.decks.find(x => x.id === id);
    document.getElementById('df-title').innerHTML =
      `<i class="fi fi-sr-edit" style="color:var(--red);"></i> แก้ไขกองไพ่`;
    document.getElementById('df-name').value  = d.name;
    document.getElementById('df-icon').value  = d.icon  || 'fi-sr-flame';
    document.getElementById('df-theme').value = d.theme || 'default';
    document.getElementById('df-desc').value  = d.desc  || '';
    document.getElementById('df-cost').value  = d.cost  || 1;
  } else {
    document.getElementById('df-title').innerHTML =
      `<i class="fi fi-sr-layers" style="color:var(--red);"></i> เพิ่มกองไพ่ใหม่`;
    ['df-name', 'df-desc'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('df-icon').value  = 'fi-sr-flame';
    document.getElementById('df-theme').value = 'fire';
    document.getElementById('df-cost').value  = '1';
  }
  document.getElementById('deck-form-ov').classList.add('show');
}

function closeDeckForm() {
  document.getElementById('deck-form-ov').classList.remove('show');
}

function editDeck(id) { openDeckForm(id); }

function saveDeck() {
  const name  = document.getElementById('df-name').value.trim();
  if (!name) { toast('กรุณาใส่ชื่อกองไพ่', 'warning'); return; }
  const icon  = document.getElementById('df-icon').value.trim()  || 'fi-sr-flame';
  const theme = document.getElementById('df-theme').value        || 'default';
  const desc  = document.getElementById('df-desc').value.trim();
  const cost  = parseInt(document.getElementById('df-cost').value) || 1;

  if (editDeckId) {
    const d = DB.decks.find(x => x.id === editDeckId);
    Object.assign(d, { name, icon, theme, desc, cost });
  } else {
    const id = 'd' + Date.now();
    DB.decks.push({ id, name, icon, theme, desc, cost });
    DB.cards[id] = [];
  }
  saveDB();
  closeDeckForm();
  renderAdmDecks();
  renderAdmSel();
  toast('บันทึกกองไพ่แล้ว', 'success');
}

function delDeck(id) {
  if (!confirm('ลบกองไพ่นี้? ไพ่ทั้งหมดจะหายด้วย')) return;
  DB.decks   = DB.decks.filter(d => d.id !== id);
  delete DB.cards[id];
  saveDB();
  renderAdmDecks();
  renderAdmSel();
  toast('ลบกองไพ่แล้ว', 'info');
}

/* ---- CARD EDITOR ---- */
function loadCE() {
  const id = document.getElementById('adm-deck-sel').value;
  const ed = document.getElementById('card-list-ed');
  if (!id) {
    ed.innerHTML = '';
    document.getElementById('ce-title').innerHTML =
      '<i class="fi fi-sr-layers" style="color:var(--red);"></i> เลือกกองไพ่ก่อน';
    return;
  }
  const d = DB.decks.find(x => x.id === id);
  document.getElementById('ce-title').innerHTML =
    `<i class="fi ${d.icon || 'fi-sr-layers'}" style="color:var(--red);"></i> ${d.name} — แก้ไขไพ่`;
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
    <button class="del-btn" onclick="this.parentElement.remove()">
      <i class="fi fi-sr-cross"></i>
    </button>`;
  ed.appendChild(r);
  r.querySelector('input:last-of-type').focus();
}

function saveCards() {
  const id = document.getElementById('adm-deck-sel').value;
  if (!id) { toast('เลือกกองไพ่ก่อน', 'warning'); return; }
  const rows = document.querySelectorAll('#card-list-ed .ced-row');
  DB.cards[id] = [];
  rows.forEach(r => {
    const ins = r.querySelectorAll('input');
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
  DB.settings.startCredit = parseInt(document.getElementById('st-cr').value)   || 10;
  DB.settings.siteName    = document.getElementById('st-nm').value             || 'DEALSHOT';
  DB.settings.testMode    = parseInt(document.getElementById('st-test').value);
  DB.settings.showModal   = parseInt(document.getElementById('st-modal').value);
  saveDB();
  applyTestMode();  // เพิ่ม
  toast('บันทึกการตั้งค่าแล้ว', 'success');
}

/* ---- SPREADSHEET ---- */
function connectSheet() {
  const url = document.getElementById('sheet-url').value.trim();
  if (!url) { toast('กรุณาใส่ URL', 'warning'); return; }
  toast('ฟีเจอร์นี้ต้องใช้ Backend — กำลังพัฒนา', 'info');
}

/* ---- EXPORT / IMPORT ---- */
function exportData() {
  const b = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(b);
  a.download = 'dealshot_data.json';
  a.click();
}

function importData() { document.getElementById('imp-file').click(); }

function handleImport(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      DB = JSON.parse(ev.target.result);
      saveDB();
      renderAdmDecks();
      renderAdmSel();
      toast('Import สำเร็จ', 'success');
    } catch { toast('ไฟล์ไม่ถูกต้อง', 'error'); }
  };
  r.readAsText(f);
}

function resetData() {
  if (!confirm('รีเซ็ตข้อมูลทั้งหมดกลับค่าเริ่มต้น?')) return;
  resetDB();
  renderAdmDecks();
  renderAdmSel();
  toast('รีเซ็ตแล้ว', 'info');
}

function toggleDeck(id) {
  const d = DB.decks.find(x => x.id === id);
  d.hidden = d.hidden ? 0 : 1;
  saveDB();
  renderAdmDecks();
  toast(d.hidden ? 'ซ่อนกองไพ่แล้ว' : 'แสดงกองไพ่แล้ว', 'info');
}
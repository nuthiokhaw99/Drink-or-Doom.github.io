
const API = {
  sheetUrl: localStorage.getItem('ds_sheet_url') || '',

  setSheetUrl(url) {
    this.sheetUrl = url;
    localStorage.setItem('ds_sheet_url', url);
  },

  /* แปลง Google Sheets URL → JSON export URL */
  toJsonUrl(sheetUrl, sheetIndex = 0) {
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return null;
    return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:json&sheet=${sheetIndex}`;
  },

  /* ดึงข้อมูล Sheets แล้ว parse เป็น array of objects */
  async fetchSheet(sheetUrl, sheetName = '') {
    try {
      const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) throw new Error('URL ไม่ถูกต้อง');
      const url = `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
      const res  = await fetch(url);
      const text = await res.text();
      const json = JSON.parse(text.replace(/^[^{]+/, '').replace(/[^}]+$/, ''));
      const cols = json.table.cols.map(c => c.label);
      return json.table.rows.map(row => {
        const obj = {};
        row.c.forEach((cell, i) => { obj[cols[i]] = cell ? cell.v : ''; });
        return obj;
      });
    } catch (e) {
      console.error('fetchSheet error:', e);
      throw e;
    }
  },

  /* โหลด decks + cards จาก Sheets แล้วอัพเดต DB */
  async syncFromSheets(url) {
    const decksRaw = await this.fetchSheet(url, 'decks');
    const cardsRaw = await this.fetchSheet(url, 'cards');

    DB.decks = decksRaw.map(r => ({
      id:   r.id   || ('d' + Date.now()),
      name: r.name || 'ไม่มีชื่อ',
      icon: r.icon || 'fi-sr-flame',
      theme:r.theme || 'default',
      cost: parseInt(r.cost_per_card) || 1,
      desc: r.description || ''
    }));

    DB.cards = {};
    DB.decks.forEach(d => { DB.cards[d.id] = []; });
    cardsRaw.forEach(r => {
      const did = r.deck_id;
      if (DB.cards[did]) DB.cards[did].push({ cat: r.category || 'ทั่วไป', text: r.text || '' });
    });

    saveDB();
    return { decks: DB.decks.length, cards: cardsRaw.length };
  }
};

/* ---- UI handler ---- */
function connectSheet() {
  const url = document.getElementById('sheet-url').value.trim();
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

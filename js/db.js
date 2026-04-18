/* =========================================
   db.js — Data Layer (Supabase only)
   ย้ายข้อมูล deck/card ออกจาก localStorage
   ดึงทั้งหมดจาก Supabase แทน
   ========================================= */

/* DB object ใช้เป็น in-memory cache ระหว่าง session
   โหลดครั้งแรกตอน initDB() เรียก
   ไม่มีการเขียน localStorage อีกต่อไป           */
let DB = {
  decks:    [],
  cards:    {},
  settings: { startCredit: 10, siteName: 'DRINKORDOOM', testMode: 1, showModal: 1, defaultCost: 1, topupEnabled: 1, deckLayout: 'auto' }
};

/* ---- SETTINGS ยังคงใช้ localStorage (เป็นข้อมูล admin config ไม่ใช่ไพ่) ---- */
const _storage = (() => {
  try { localStorage.setItem('_t','1'); localStorage.removeItem('_t'); return localStorage; }
  catch(e) { const m={}; return { getItem:k=>m[k]??null, setItem:(k,v)=>{m[k]=v;}, removeItem:k=>{delete m[k];} }; }
})();

function saveSettings() {
  _storage.setItem('ds_settings', JSON.stringify(DB.settings));
}

function loadSettings() {
  try {
    const saved = JSON.parse(_storage.getItem('ds_settings') || 'null');
    if (saved) DB.settings = { ...DB.settings, ...saved };
  } catch(e) { /* ใช้ default */ }
}

async function initDB() {
  loadSettings();

  try {
    // ✅ โหลด settings จาก Supabase ทับ localStorage cache
    const { data: settingsData } = await _sb
      .from('app_settings')
      .select('key, value');

    if (settingsData?.length) {
      settingsData.forEach(({ key, value }) => {
        const num = Number(value);
        DB.settings[key] = isNaN(num) ? value : num;
      });
    }

    // โหลด decks
    const { data: decksData, error: decksError } = await _sb
      .from('decks')
      .select('id, name, icon, theme, cost, description, category, hidden, sort_order')
      .order('sort_order', { ascending: true });

    if (decksError) throw decksError;

    DB.decks = (decksData || []).map(d => ({
      id:       d.id,
      name:     d.name,
      icon:     d.icon || 'fi-sr-layers',
      theme:    d.theme || 'default',
      cost:     d.cost ?? 1,
      desc:     d.description || '',
      category: d.category || 'ทั่วไป',
      hidden:   d.hidden || false
    }));

    // โหลด cards ทั้งหมด (ไม่ติด limit 1000)
    const cardsData = await fetchAllCards();

    DB.cards = {};
    DB.decks.forEach(d => { DB.cards[d.id] = []; });
    cardsData.forEach(c => {
      if (DB.cards[c.deck_id]) {
        DB.cards[c.deck_id].push({ cat: c.category, text: c.text });
      }
    });

  } catch (e) {
    console.error('[DB] initDB error:', e);
    if (typeof toast === 'function') toast('ไม่สามารถโหลดข้อมูลได้ กรุณา refresh', 'error');
  }
}

// แก้ใหม่ — ดึงทีละ 1000 จนครบ
async function fetchAllCards() {
  let all = [];
  let from = 0;
  const STEP = 1000;
  while (true) {
    const { data, error } = await _sb
      .from('cards')
      .select('deck_id, category, text')
      .order('id', { ascending: true })
      .range(from, from + STEP - 1);
    if (error) throw error;
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < STEP) break; // ได้ครบแล้ว
    from += STEP;
  }
  return all;
}

/* ---- ADMIN: บันทึก deck ลง Supabase ---- */
async function saveDeckToDB(deck) {
  const { error } = await _sb.from('decks').upsert({
    id:          deck.id,
    name:        deck.name,
    icon:        deck.icon,
    theme:       deck.theme,
    cost:        deck.cost,
    description: deck.desc || '',
    category:    deck.category || 'ทั่วไป',
    hidden:      deck.hidden || false
  }, { onConflict: 'id' });
  if (error) { console.error('saveDeckToDB error:', error); return false; }
  return true;
}

async function deleteDeckFromDB(deckId) {
  const { error } = await _sb.from('decks').delete().eq('id', deckId);
  if (error) { console.error('deleteDeckFromDB error:', error); return false; }
  return true;
}

async function saveCardsToDB(deckId, cards) {
  const CHUNK = 25;
  const rows = cards.map(c => ({
    deck_id:  deckId,
    category: c.cat || 'ทั่วไป',
    text:     c.text
  }));

  // ลบของเดิมก่อน
  const { error: delErr } = await _sb.from('cards').delete().eq('deck_id', deckId);
  if (delErr) { console.error('delete error:', delErr); return false; }

  if (!rows.length) return true;

  // insert ทีละ chunk
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await _sb.from('cards').insert(rows.slice(i, i + CHUNK));
    if (error) {
      console.error(`saveCardsToDB error at chunk ${i}:`, error);
      toast(`บันทึกไพ่ล้มเหลวที่ใบที่ ${i + 1} — กรุณาลองใหม่`, 'error');
      return false;
    }
  }

  return true;
}

/* ---- COMPAT: saveDB ยังคงใช้ได้ (บันทึก settings เท่านั้น) ---- */
const saveDB = () => saveSettings();

/* ---- RESET ---- */
async function resetDB() {
  // reset เฉพาะ settings — ไม่ลบข้อมูลใน Supabase
  DB.settings = { startCredit: 10, siteName: 'DRINKORDOOM', testMode: 1, showModal: 1, defaultCost: 1, topupEnabled: 1 };
  saveSettings();
  await initDB();
}
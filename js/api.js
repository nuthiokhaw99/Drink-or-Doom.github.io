const API = {
  // [FIX #19] ไม่เก็บ sheet URL ใน localStorage — ใช้แค่ใน memory session
  sheetUrl: '',

  setSheetUrl(url) {
    this.sheetUrl = url;
    // ไม่ localStorage.setItem แล้ว — ป้องกัน URL admin รั่วบน shared computer
  },

  toJsonUrl(sheetUrl, sheetIndex = 0) {
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return null;
    return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:json&sheet=${sheetIndex}`;
  },

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

  async syncFromSheets(url) {
    const decksRaw = await this.fetchSheet(url, 'decks');
    const cardsRaw = await this.fetchSheet(url, 'cards');

    // [UPDATED] upsert เข้า Supabase แทน localStorage
    const deckRows = decksRaw.map(r => ({
      id:          r.id   || ('d' + Date.now()),
      name:        r.name || 'ไม่มีชื่อ',
      icon:        r.icon || 'fi-sr-flame',
      theme:       r.theme || 'default',
      cost:        parseInt(r.cost_per_card) || 1,
      description: r.description || '',
      category:    r.category || 'ทั่วไป'
    }));

    const { error: deckErr } = await _sb
      .from('decks')
      .upsert(deckRows, { onConflict: 'id' });
    if (deckErr) throw new Error('upsert decks: ' + deckErr.message);

    const deckIds = deckRows.map(d => d.id);
    await _sb.from('cards').delete().in('deck_id', deckIds);

    if (cardsRaw.length) {
      const cardRows = cardsRaw
        .filter(r => deckIds.includes(r.deck_id))
        .map(r => ({ deck_id: r.deck_id, category: r.category || 'ทั่วไป', text: r.text || '' }));
      const { error: cardErr } = await _sb.from('cards').insert(cardRows);
      if (cardErr) throw new Error('insert cards: ' + cardErr.message);
    }

    await initDB();
    return { decks: deckRows.length, cards: cardsRaw.length };
  },

  /* =========================================
     CREDITS — Supabase
     ========================================= */

  async getCredits() {
    if (!currentUser) return 0;
    const { data, error } = await _sb
      .from('profiles')
      .select('credits')
      .eq('id', currentUser.id)
      .single();
    if (error) { console.error('getCredits error:', error); return 0; }
    return data?.credits ?? 0;
  },

  async saveCredits(amount) {
    if (!currentUser) return;
    const { error } = await _sb
      .from('profiles')
      .update({ credits: amount })
      .eq('id', currentUser.id);
    if (error) console.error('saveCredits error:', error);
  },

  async addCredits(amount) {
    const current = await this.getCredits();
    const newVal  = current + amount;
    await this.saveCredits(newVal);
    return newVal;
  },

  /* =========================================
     [FIX #5] Atomic credit deduction ผ่าน Supabase RPC
     ป้องกัน race condition เมื่อกดไพ่หลายใบพร้อมกัน
     
     ต้องสร้าง function นี้บน Supabase SQL Editor:
     
     CREATE OR REPLACE FUNCTION deduct_credits(user_id uuid, amount integer)
     RETURNS integer
     LANGUAGE plpgsql SECURITY DEFINER AS $$
     DECLARE
       current_credits integer;
       new_credits integer;
     BEGIN
       SELECT credits INTO current_credits FROM profiles WHERE id = user_id FOR UPDATE;
       IF current_credits < amount THEN
         RETURN -1; -- ไม่พอ
       END IF;
       new_credits := current_credits - amount;
       UPDATE profiles SET credits = new_credits WHERE id = user_id;
       RETURN new_credits;
     END;
     $$;
     ========================================= */
  async deductCredits(amount) {
    if (!currentUser) return { success: false, newBalance: 0 };

    const { data, error } = await _sb.rpc('deduct_credits', {
      user_id: currentUser.id,
      amount:  amount
    });

    if (error) {
      console.error('deductCredits error:', error);
      // fallback: ถ้า RPC ยังไม่ได้สร้าง ใช้วิธีเดิมชั่วคราว
      const current = await this.getCredits();
      if (current < amount) return { success: false, newBalance: current };
      const newVal = current - amount;
      await this.saveCredits(newVal);
      return { success: true, newBalance: newVal };
    }

    if (data === -1) return { success: false, newBalance: await this.getCredits() };
    return { success: true, newBalance: data };
  },

  async adminSetCredits(userId, amount) {
    const { error } = await _sb
      .from('profiles')
      .update({ credits: amount })
      .eq('id', userId);
    if (error) { console.error('adminSetCredits error:', error); return false; }
    return true;
  },

  async getAllUsers() {
    const { data, error } = await _sb
      .from('profiles')
      .select('id, username, credits, is_admin, is_banned, last_seen')
      .order('id', { ascending: false });
    if (error) { console.error(error); return []; }
    return data;
  }
// <<<<<<< HEAD
};

async function _logAdminAction({ action, targetType, targetId, beforeVal, afterVal, note }) {
  try {
    const { data: { session } } = await _sb.auth.getSession()
    if (!session) return  // ถ้าไม่มี session ก็ไม่ต้อง log

    await fetch('https://xxxx.supabase.co/functions/v1/admin-action', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ action, targetType, targetId, beforeVal, afterVal, note })
    })
  } catch (e) {
    console.warn('audit log failed (non-critical):', e)
    // ล้มเหลวได้โดยไม่ block main action
  }
}
// =======
// };
// >>>>>>> 35c8474b63db1f7722e0f8c3738916b5f76e4a23
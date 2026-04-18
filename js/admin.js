/* =========================================
   admin.js - Admin Panel Logic
   ========================================= */

let editDeckId = null;

/* ---- TABS ---- */
function switchTab(name, idx) {
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('act', i === idx));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('act'));
  const target = document.getElementById('tc-' + name);
  if (target) target.classList.add('act');

  // อัปเดต URL ให้ต่างกันแต่ละ tab
  history.replaceState({}, '', '#admin/' + name);

  if (name === 'users')    loadUserTab();
  if (name === 'stats')    loadStatsTab();
  if (name === 'history')  loadHistoryTab();
  if (name === 'announce') loadAnnounceTab();
  if (name === 'settings') { loadSettingsTab(); }
  if (name === 'cards')    { renderAdmSel(); }
if (name === 'decks')    { renderAdmDecks(); renderAdmSel(); }  // ← เพิ่ม
if (name === 'search')   { initCardSearch(); }
if (name === 'sheet')    {} // static content
}

/* ---- TAB LOADERS ---- */
async function loadUserTab() {
  const container = document.getElementById('tc-users');
  if (!container) return;
  // loadAdminUserList จาก app.js inject เข้า #admin-user-list ซึ่งอยู่ใน tc-users แล้ว
  if (typeof loadAdminUserList === 'function') await loadAdminUserList();
}

async function loadStatsTab() {
  const container = document.getElementById('tc-stats');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text3);font-size:.85rem;padding:16px;"><i class="fi fi-sr-spinner fi-spin"></i> กำลังโหลดสถิติ...</p>';

  // ดึงข้อมูลพร้อมกันทั้งหมด
  const [
    users,
    { data: history },
    { data: packages }
  ] = await Promise.all([
    API.getAllUsers(),
    _sb.from('credit_history').select('*').order('created_at', { ascending: false }).limit(500),
    _sb.from('packages').select('*').eq('is_active', true)
  ]);

  const now        = new Date();
  const weekAgo    = new Date(now - 7  * 86400000);
  const monthAgo   = new Date(now - 30 * 86400000);

  // ---- ผู้ใช้ ----
  const totalUsers    = users.length;
  const bannedUsers   = users.filter(u => u.is_banned).length;
  const adminUsers    = users.filter(u => u.is_admin).length;
  const activeWeek    = users.filter(u => u.last_seen && new Date(u.last_seen) >= weekAgo).length;
  const activeMonth   = users.filter(u => u.last_seen && new Date(u.last_seen) >= monthAgo).length;
  const totalCredits  = users.reduce((s, u) => s + (u.credits || 0), 0);
  const topCredUser   = [...users].sort((a, b) => (b.credits||0) - (a.credits||0))[0];

  // ---- กองไพ่ & ไพ่ ----
  const activeDecks  = DB.decks.filter(d => !d.hidden).length;
  const hiddenDecks  = DB.decks.filter(d =>  d.hidden).length;
  const totalCards   = Object.values(DB.cards).reduce((s, a) => s + a.length, 0);

  // top deck by card count
  const decksSorted  = [...DB.decks].sort((a, b) => (DB.cards[b.id]||[]).length - (DB.cards[a.id]||[]).length);

  // ---- เครดิต / ประวัติ ----
  const hist         = history || [];
  const purchases    = hist.filter(h => h.type === 'purchase');
  const frees        = hist.filter(h => h.type === 'free');
  const deducts      = hist.filter(h => h.type === 'deduct');
  const totalEarned  = purchases.reduce((s, h) => s + (h.amount || 0), 0);
  const totalUsed    = Math.abs(deducts.reduce((s, h) => s + (h.amount || 0), 0));

  const purchaseThisMonth = purchases.filter(h => new Date(h.created_at) >= monthAgo);
  const revenueEst        = purchaseThisMonth.reduce((s, h) => {
    const pkg = (packages || []).find(p => {
      const total = p.coins + p.bonus;
      return total === h.amount;
    });
    return s + (pkg ? pkg.price : 0);
  }, 0);

  // ---- ผู้ใช้ลงทะเบียนใหม่ ----
  const newThisWeek  = users.filter(u => {
    // ใช้ last_seen เป็น proxy ถ้าไม่มี created_at
    return u.last_seen && new Date(u.last_seen) >= weekAgo;
  }).length;

  // ---- สร้าง HTML ----
  container.innerHTML = `
    <!-- ROW 1: ตัวเลขหลัก -->
    <div class="sheet-sec">
      <h3><i class="fi fi-sr-users" style="color:var(--gold);"></i> ผู้ใช้งาน</h3>
      <div class="stats-grid-4">
        <div class="stat-card2">
          <div class="sc2-ico" style="background:rgba(245,197,24,.1);color:var(--gold);"><i class="fi fi-sr-users"></i></div>
          <div class="sc2-body">
            <div class="sc2-val">${totalUsers.toLocaleString()}</div>
            <div class="sc2-lbl">ผู้ใช้ทั้งหมด</div>
          </div>
        </div>
        <div class="stat-card2">
          <div class="sc2-ico" style="background:rgba(76,175,80,.1);color:#4caf50;"><i class="fi fi-sr-user-check"></i></div>
          <div class="sc2-body">
            <div class="sc2-val" style="color:#4caf50;">${activeWeek}</div>
            <div class="sc2-lbl">Active 7 วัน</div>
          </div>
        </div>
        <div class="stat-card2">
          <div class="sc2-ico" style="background:rgba(33,150,243,.1);color:#42a5f5;"><i class="fi fi-sr-calendar"></i></div>
          <div class="sc2-body">
            <div class="sc2-val" style="color:#42a5f5;">${activeMonth}</div>
            <div class="sc2-lbl">Active 30 วัน</div>
          </div>
        </div>
        <div class="stat-card2">
          <div class="sc2-ico" style="background:rgba(229,9,20,.1);color:var(--red);"><i class="fi fi-sr-ban"></i></div>
          <div class="sc2-body">
            <div class="sc2-val" style="color:var(--red);">${bannedUsers}</div>
            <div class="sc2-lbl">ถูกแบน</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ROW 2: เครดิต -->
    <div class="sheet-sec">
      <h3><i class="fi fi-sr-coins" style="color:var(--gold);"></i> เครดิตในระบบ</h3>
      <div class="stats-grid-4">
        <div class="stat-card2">
          <div class="sc2-ico" style="background:rgba(245,197,24,.1);color:var(--gold);"><i class="fi fi-sr-piggy-bank"></i></div>
          <div class="sc2-body">
            <div class="sc2-val">${totalCredits.toLocaleString()}</div>
            <div class="sc2-lbl">เครดิตคงเหลือ (ทุกคน)</div>
          </div>
        </div>
        <div class="stat-card2">
          <div class="sc2-ico" style="background:rgba(76,175,80,.1);color:#4caf50;"><i class="fi fi-sr-add"></i></div>
          <div class="sc2-body">
            <div class="sc2-val" style="color:#4caf50;">+${totalEarned.toLocaleString()}</div>
            <div class="sc2-lbl">เครดิตที่ซื้อทั้งหมด</div>
          </div>
        </div>
        <div class="stat-card2">
          <div class="sc2-ico" style="background:rgba(229,9,20,.1);color:var(--red);"><i class="fi fi-sr-layers"></i></div>
          <div class="sc2-body">
            <div class="sc2-val" style="color:var(--red);">-${totalUsed.toLocaleString()}</div>
            <div class="sc2-lbl">เครดิตที่ใช้ไปรวม</div>
          </div>
        </div>
        <div class="stat-card2">
          <div class="sc2-ico" style="background:rgba(156,39,176,.1);color:#ce93d8;"><i class="fi fi-sr-gift"></i></div>
          <div class="sc2-body">
            <div class="sc2-val" style="color:#ce93d8;">${frees.length}</div>
            <div class="sc2-lbl">รับฟรีทั้งหมด (ครั้ง)</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ROW 3: กองไพ่ -->
    <div class="sheet-sec">
      <h3><i class="fi fi-sr-layers" style="color:var(--red);"></i> กองไพ่ & ไพ่</h3>
      <div class="stats-grid-4">
        <div class="stat-card2">
          <div class="sc2-ico" style="background:rgba(76,175,80,.1);color:#4caf50;"><i class="fi fi-sr-eye"></i></div>
          <div class="sc2-body">
            <div class="sc2-val" style="color:#4caf50;">${activeDecks}</div>
            <div class="sc2-lbl">กองไพ่ที่แสดง</div>
          </div>
        </div>
        <div class="stat-card2">
          <div class="sc2-ico" style="background:rgba(85,85,85,.15);color:#777;"><i class="fi fi-sr-eye-crossed"></i></div>
          <div class="sc2-body">
            <div class="sc2-val" style="color:#777;">${hiddenDecks}</div>
            <div class="sc2-lbl">กองไพ่ที่ซ่อน</div>
          </div>
        </div>
        <div class="stat-card2">
          <div class="sc2-ico" style="background:rgba(229,9,20,.1);color:var(--red);"><i class="fi fi-sr-copy-alt"></i></div>
          <div class="sc2-body">
            <div class="sc2-val">${totalCards.toLocaleString()}</div>
            <div class="sc2-lbl">ไพ่ทั้งหมดในระบบ</div>
          </div>
        </div>
        <div class="stat-card2">
          <div class="sc2-ico" style="background:rgba(245,197,24,.1);color:var(--gold);"><i class="fi fi-sr-trophy"></i></div>
          <div class="sc2-body">
            <div class="sc2-val" style="color:var(--gold);font-size:1rem;">${decksSorted[0]?.name || '—'}</div>
            <div class="sc2-lbl">กองไพ่ที่มีไพ่มากสุด (${(DB.cards[decksSorted[0]?.id]||[]).length} ใบ)</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ROW 4: Top Decks -->
    <div class="sheet-sec">
      <h3><i class="fi fi-sr-ranking-star" style="color:var(--gold);"></i> กองไพ่ - จัดอันดับตามจำนวนไพ่</h3>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
        ${decksSorted.slice(0, 6).map((d, i) => {
          const cnt    = (DB.cards[d.id] || []).length;
          const maxCnt = (DB.cards[decksSorted[0]?.id] || []).length || 1;
          const pct    = Math.round(cnt / maxCnt * 100);
          const th     = getTh(d);
          return `
          <div style="display:flex;align-items:center;gap:12px;background:#161616;border:1px solid #222;border-radius:10px;padding:10px 14px;">
            <div style="width:22px;color:${i<3?'var(--gold)':'var(--text3)'};font-weight:900;font-size:.9rem;text-align:center;">${i+1}</div>
            <div class="drow-ico ${th}" style="width:34px;height:34px;font-size:.85rem;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <i class="fi ${d.icon||'fi-sr-layers'}"></i>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${d.name}
                ${d.hidden ? '<span style="color:var(--text3);font-size:.7rem;margin-left:6px;">(ซ่อน)</span>' : ''}
              </div>
              <div style="margin-top:5px;height:4px;background:#222;border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--red),#ff4d4d);border-radius:4px;transition:.5s;"></div>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-weight:700;color:var(--gold);">${cnt}</div>
              <div style="font-size:.68rem;color:var(--text3);">ใบ</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-weight:700;color:var(--text2);">${d.cost||1}</div>
              <div style="font-size:.68rem;color:var(--text3);">เครดิต/ใบ</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- ROW 5: Top Users by Credits -->
    <div class="sheet-sec">
      <h3><i class="fi fi-sr-crown" style="color:var(--gold);"></i> ผู้ใช้ที่มีเครดิตสูงสุด</h3>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
        ${[...users].sort((a,b)=>(b.credits||0)-(a.credits||0)).slice(0,5).map((u, i) => `
          <div style="display:flex;align-items:center;gap:12px;background:#161616;border:1px solid #222;border-radius:10px;padding:10px 14px;">
            <div style="width:22px;color:${i<3?'var(--gold)':'var(--text3)'};font-weight:900;font-size:.9rem;text-align:center;">${i+1}</div>
            <div style="width:34px;height:34px;border-radius:50%;background:rgba(229,9,20,.12);border:1px solid rgba(229,9,20,.2);display:flex;align-items:center;justify-content:center;color:var(--red);flex-shrink:0;">
              <i class="fi ${u.is_admin?'fi-sr-shield-check':'fi-sr-user'}" style="font-size:.8rem;"></i>
            </div>
            <div style="flex:1;">
              <div style="font-weight:700;font-size:.88rem;">
                ${u.username}
                ${u.is_admin?'<span style="color:var(--red);font-size:.7rem;margin-left:6px;">admin</span>':''}
                ${u.is_banned?'<span style="color:#777;font-size:.7rem;margin-left:6px;">banned</span>':''}
              </div>
              <div style="font-size:.72rem;color:var(--text3);">
                ${u.last_seen ? 'Active ' + new Date(u.last_seen).toLocaleDateString('th-TH',{day:'2-digit',month:'short'}) : 'ไม่มีข้อมูล'}
              </div>
            </div>
            <div style="font-weight:900;font-size:1.1rem;color:var(--gold);">
              ${(u.credits||0).toLocaleString()}
              <span style="font-size:.65rem;color:var(--text3);font-weight:400;">เครดิต</span>
            </div>
          </div>`).join('')}
      </div>
    </div>
  `;

  // update legacy stat elements ด้านบน (stat bar)
  const elUsers = document.getElementById('stat-users');
  if (elUsers) elUsers.textContent = totalUsers;
}
async function loadHistoryTab() {
  const container = document.getElementById('tc-history');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text3);font-size:.85rem;padding:16px;">กำลังโหลด...</p>';

  // ดึง history และ users พร้อมกัน
  const [{ data, error }, { data: users }] = await Promise.all([
    _sb.from('credit_history').select('*').order('created_at', { ascending: false }).limit(100),
    _sb.from('profiles').select('id, username')
  ]);

  if (error || !data?.length) {
    container.innerHTML = '<p style="color:var(--text3);padding:16px;">ไม่พบประวัติ</p>';
    return;
  }

  // สร้าง map id → username
  const userMap = {};
  (users || []).forEach(u => { userMap[u.id] = u.username; });

  const TYPE_ICO = {
    free:             'fi-sr-gift',
    purchase:         'fi-sr-shopping-cart',
    purchase_pending: 'fi-sr-clock',       // ✅ เพิ่ม
    deduct:           'fi-sr-layers',
    admin:            'fi-sr-shield-check',
  };
  const TYPE_LABEL = {
    free:             'รับฟรี',
    purchase:         'ซื้อเครดิต',
    purchase_pending: 'รอชำระ',            // ✅ เพิ่ม
    deduct:           'ใช้ไพ่',
    admin:            'แอดมินเติม',
  };

  const rows = data.map(h => {
    const isPlus   = h.amount > 0;
    const typeKey  = h.type || 'deduct';
    const ico      = TYPE_ICO[typeKey]   || 'fi-sr-coins';
    const label    = TYPE_LABEL[typeKey] || typeKey;
    const username = userMap[h.user_id]  || h.user_id?.slice(0,8) || '?';
    const date     = new Date(h.created_at);
    const dateStr  = date.toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr  = date.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });

    return `
    <div class="hist-row">
      <div class="hist-ico ${isPlus ? 'hist-ico-plus' : 'hist-ico-minus'}">
        <i class="fi ${ico}"></i>
      </div>
      <div class="hist-info">
        <div class="hist-top">
          <span class="hist-note">${h.note || label}</span>
          <span class="hist-type-badge hist-type-${typeKey}">${label}</span>
        </div>
        <div class="hist-sub">
          <span class="hist-user"><i class="fi fi-sr-user"></i> ${username}</span>
          <span class="hist-sep">·</span>
          <span class="hist-date"><i class="fi fi-sr-calendar"></i> ${dateStr}</span>
          <span class="hist-sep">·</span>
          <span class="hist-time"><i class="fi fi-sr-clock"></i> ${timeStr}</span>
        </div>
      </div>
      <div class="hist-amount ${isPlus ? 'hist-plus' : 'hist-minus'}">
        ${isPlus ? '+' : ''}${h.amount}
        <span class="hist-unit">เครดิต</span>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">${rows}</div>`;
}
async function loadAnnounceTab() {
  const container = document.getElementById('tc-announce');
  if (!container) return;
  const listEl = document.getElementById('announce-list');
  if (!listEl) return;

  listEl.innerHTML = '<p style="color:var(--text3);font-size:.85rem;padding:12px;">กำลังโหลด...</p>';

  const { data, error } = await _sb
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data?.length) {
    listEl.innerHTML = '<p style="color:var(--text3);padding:12px;">ไม่พบประกาศ</p>';
    return;
  }

  const TYPE_ICO = {
    info: 'fi-sr-info', promo: 'fi-sr-star',
    warning: 'fi-sr-triangle-warning', success: 'fi-sr-check-circle'
  };
  const TYPE_LABEL = {
    info: 'ข้อมูล', promo: 'โปรโมชั่น', warning: 'แจ้งเตือน', success: 'ข่าวดี'
  };

  listEl.innerHTML = data.map(a => {
    const t       = a.type || 'info';
    const created = new Date(a.created_at).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' });
    const expires = a.expires_at
      ? new Date(a.expires_at).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' })
      : null;
    return `
    <div class="ann-row">
      <div class="ann-row-ico ann-ico-${t}">
        <i class="fi ${TYPE_ICO[t] || 'fi-sr-bell'}"></i>
      </div>
      <div class="ann-row-info">
        <div class="ann-row-top">
          <span class="ann-row-title">${a.title || '(ไม่มีชื่อ)'}</span>
          <span class="ann-badge ann-badge-${t}">${TYPE_LABEL[t] || t}</span>
          <span class="ann-badge ${a.active ? 'ann-badge-active' : 'ann-badge-draft'}">
            <i class="fi ${a.active ? 'fi-sr-eye' : 'fi-sr-eye-crossed'}"></i>
            ${a.active ? 'เผยแพร่' : 'draft'}
          </span>
          ${a.show_popup ? '<span class="ann-badge ann-badge-info"><i class="fi fi-sr-window-popup"></i> popup</span>' : ''}
        </div>
        <div class="ann-row-msg" style="white-space:pre-wrap;">${a.message || ''}</div>
        <div class="ann-row-sub">
          <span><i class="fi fi-sr-calendar"></i> ${created}</span>
          ${expires ? `<span class="sep">·</span><span><i class="fi fi-sr-hourglass-end"></i> หมดอายุ ${expires}</span>` : ''}
        </div>
      </div>
        <div class="ann-row-acts">
          <button class="btn-sm btn-edit" onclick="editAnnounce('${a.id}')">
            <i class="fi fi-sr-edit"></i> แก้ไข
          </button>
          <button class="btn-sm btn-edit" onclick="toggleAnnounce('${a.id}', ${!a.active})">
            <i class="fi fi-sr-${a.active ? 'eye-crossed' : 'eye'}"></i>
            ${a.active ? 'ซ่อน' : 'เผยแพร่'}
          </button>
          <button class="btn-sm btn-del" onclick="deleteAnnounce('${a.id}')">
            <i class="fi fi-sr-trash"></i>
          </button>
        </div>
    </div>`;
  }).join('');
}

async function createAnnounce() {
  const title   = document.getElementById('ann-title')?.value.trim();
  const message = document.getElementById('ann-message')?.value.trim();
  const type    = document.getElementById('ann-type')?.value || 'info';
  const popup   = document.getElementById('ann-popup')?.value === '1';
  const active  = document.getElementById('ann-active')?.value === '1';
  const expires = document.getElementById('ann-expires')?.value || null;

  if (!title || !message) { toast('กรุณากรอกหัวข้อและข้อความ', 'warning'); return; }

  const { error } = await _sb.from('announcements').insert({
    title, message, type,
    show_popup: popup,
    active,
    expires_at: expires ? new Date(expires).toISOString() : null,
  });

  if (error) { toast('เกิดข้อผิดพลาด: ' + error.message, 'error'); return; }

  toast('เพิ่มประกาศแล้ว', 'success');
  document.getElementById('ann-title').value   = '';
  document.getElementById('ann-message').value = '';
  document.getElementById('ann-expires').value = '';
  loadAnnounceTab();
}

async function editAnnounce(id) {
  const { data, error } = await _sb
    .from('announcements')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) { toast('โหลดประกาศไม่สำเร็จ', 'error'); return; }

  // เติมค่าลงฟอร์ม
  document.getElementById('ann-title').value   = data.title   || '';
  document.getElementById('ann-message').value = data.message || '';
  document.getElementById('ann-type').value    = data.type    || 'info';
  document.getElementById('ann-popup').value   = data.show_popup ? '1' : '0';
  document.getElementById('ann-active').value  = data.active  ? '1' : '0';
  document.getElementById('ann-expires').value = data.expires_at
    ? new Date(data.expires_at).toISOString().slice(0, 16)
    : '';

  // เปลี่ยนปุ่มเป็น "อัปเดต"
  const btn = document.querySelector('[onclick="createAnnounce()"]');
  if (btn) {
    btn.innerHTML = '<i class="fi fi-sr-disk"></i> อัปเดตประกาศ';
    btn.onclick = async () => {
      const title   = document.getElementById('ann-title').value.trim();
      const message = document.getElementById('ann-message').value.trim();
      if (!title || !message) { toast('กรุณากรอกให้ครบ', 'warning'); return; }

      const { error } = await _sb.from('announcements').update({
        title,
        message,
        type:       document.getElementById('ann-type').value,
        show_popup: document.getElementById('ann-popup').value === '1',
        active:     document.getElementById('ann-active').value === '1',
        expires_at: document.getElementById('ann-expires').value
          ? new Date(document.getElementById('ann-expires').value).toISOString()
          : null,
      }).eq('id', id);

      if (error) { toast('เกิดข้อผิดพลาด', 'error'); return; }
      toast('อัปเดตประกาศแล้ว', 'success');

      // reset ปุ่มกลับ
      btn.innerHTML = '<i class="fi fi-sr-plus"></i> เพิ่มประกาศ';
      btn.onclick = createAnnounce;
      document.getElementById('ann-title').value   = '';
      document.getElementById('ann-message').value = '';
      document.getElementById('ann-expires').value = '';
      loadAnnounceTab();
    };
  }

  // scroll ขึ้นไปที่ฟอร์ม
  document.getElementById('ann-title').scrollIntoView({ behavior: 'smooth' });
  toast('โหลดข้อมูลประกาศแล้ว - แก้ไขแล้วกด "อัปเดต"', 'info');
}

async function deleteAnnounce(id) {
  if (!confirm('ลบประกาศนี้?')) return;
  const { error } = await _sb.from('announcements').delete().eq('id', id);
  if (error) { toast('เกิดข้อผิดพลาด', 'error'); return; }
  toast('ลบประกาศแล้ว', 'info');
  loadAnnounceTab();
}

async function toggleAnnounce(id, active) {
  const { error } = await _sb.from('announcements').update({ active }).eq('id', id);
  if (error) { toast('เกิดข้อผิดพลาด', 'error'); return; }
  toast(active ? 'เผยแพร่ประกาศแล้ว' : 'ซ่อนประกาศแล้ว', 'success');
  loadAnnounceTab();
}

/* ---- DECK LIST ---- */
function renderAdmDecks() {
  // update stats-bar (ด้านบนสุดของ admin panel)
  const deckEl = document.getElementById('stat-decks');
  const cardEl = document.getElementById('stat-cards');
  if (deckEl) deckEl.textContent = DB.decks.filter(d => !d.hidden).length;
  if (cardEl) cardEl.textContent = Object.values(DB.cards).reduce((s, arr) => s + arr.length, 0).toLocaleString();

  // render deck list ใน tab กองไพ่
  const l = document.getElementById('adm-deck-list');
  if (!l) return;
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
<div style="display:flex;flex-direction:column;gap:2px;margin-right:2px;">
<button class="btn-sm" style="padding:4px 10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#888;" onclick="moveDeck('${d.id}',-1)" title="<span>เลื่อนขึ้น</span>"><i class="fi fi-sr-angle-up"></i></button>
<button class="btn-sm" style="padding:4px 10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#888;" onclick="moveDeck('${d.id}',1)" title="<span>เลื่อนลง</span>"><i class="fi fi-sr-angle-down"></i></button>
</div>
      <button class="btn-sm ${d.hidden ? 'btn-hidden' : 'btn-visible'}" onclick="toggleDeck('${d.id}')">
        <i class="fi ${d.hidden ? 'fi-sr-eye-crossed' : 'fi-sr-eye'}"></i><span>
        ${d.hidden ? 'ซ่อนอยู่' : 'แสดงอยู่'}</span>
      </button>
      <button class="btn-sm btn-edit" onclick="editDeck('${d.id}')"><i class="fi fi-sr-edit"></i> <span>แก้ไข</span></button>
      <button class="btn-sm" style="background:rgba(245,197,24,.08);border:1px solid rgba(245,197,24,.2);color:var(--gold);" onclick="duplicateDeck('${d.id}')"><i class="fi fi-sr-copy-alt"></i> <span>ก็อปปี้</span></button>
      <button class="btn-sm btn-del"  onclick="delDeck('${d.id}')"><i class="fi fi-sr-trash"></i> <span>ลบ</span></button>
    </div>`;
    l.appendChild(r);
  });
}
async function moveDeck(id, dir) {
  const idx = DB.decks.findIndex(d => d.id === id);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= DB.decks.length) return;

  const a = DB.decks[idx];
  const b = DB.decks[swapIdx];
  const tmpOrder = a.sort_order ?? idx;
  a.sort_order = b.sort_order ?? swapIdx;
  b.sort_order = tmpOrder;

  DB.decks[idx]     = b;
  DB.decks[swapIdx] = a;

  const [r1, r2] = await Promise.all([
    _sb.from('decks').update({ sort_order: a.sort_order }).eq('id', a.id),
    _sb.from('decks').update({ sort_order: b.sort_order }).eq('id', b.id),
  ]);

  if (r1.error || r2.error) {
    toast('บันทึกลำดับไม่สำเร็จ', 'error');
    await initDB();
  }

  renderAdmDecks();
  renderDecks();
}
async function toggleDeck(id) {
  const d = DB.decks.find(x => x.id === id);
  if (!d) return;
  d.hidden = !d.hidden;

  // บันทึกไป Supabase จริง
  const { error } = await _sb.from('decks').update({ hidden: d.hidden }).eq('id', id);
  if (error) {
    d.hidden = !d.hidden; // rollback
    toast('เกิดข้อผิดพลาด บันทึกไม่สำเร็จ', 'error');
    return;
  }

  renderAdmDecks();
  renderDecks();
  toast(d.hidden ? 'ซ่อนกองไพ่แล้ว' : 'แสดงกองไพ่แล้ว', 'info');
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

const THEME_PRESETS = [
  {name:'fire',          label:'Fire',          cat:'warm',    icon:'fi-sr-flame',             bg:'linear-gradient(135deg,rgba(229,57,53,.55),rgba(183,28,28,.4))',    color:'#ff5252', tags:'red flame'},
  {name:'skull',         label:'Skull',         cat:'warm',    icon:'fi-sr-skull',             bg:'linear-gradient(135deg,rgba(229,9,20,.55),rgba(100,0,8,.4))',        color:'#ff1744', tags:'red dark'},
  {name:'heart',         label:'Heart',         cat:'warm',    icon:'fi-sr-heart',             bg:'linear-gradient(135deg,rgba(233,30,99,.55),rgba(173,20,87,.4))',     color:'#ff4081', tags:'pink red'},
  {name:'rose',          label:'Rose',          cat:'warm',    icon:'fi-sr-flower-tulip',      bg:'linear-gradient(135deg,rgba(236,64,122,.55),rgba(173,20,87,.4))',    color:'#ff80ab', tags:'pink'},
  {name:'fire_amber',    label:'Fire+Amber',    cat:'warm',    icon:'fi-sr-fire-flame-curved', bg:'linear-gradient(135deg,rgba(230,50,40,.55),rgba(255,140,0,.55))',    color:'#ff7043', tags:'red orange'},
  {name:'rose_heart',    label:'Rose+Heart',    cat:'warm',    icon:'fi-sr-heart-crack',       bg:'linear-gradient(135deg,rgba(255,60,100,.55),rgba(220,20,80,.5))',    color:'#ff80ab', tags:'pink red'},
  {name:'bolt',          label:'Bolt',          cat:'warm',    icon:'fi-sr-bolt',              bg:'linear-gradient(135deg,rgba(255,152,0,.55),rgba(230,81,0,.4))',      color:'#ffab40', tags:'orange'},
  {name:'amber',         label:'Amber',         cat:'warm',    icon:'fi-sr-sun',               bg:'linear-gradient(135deg,rgba(255,193,7,.55),rgba(255,111,0,.4))',     color:'#ffe57f', tags:'yellow orange'},
  {name:'star',          label:'Star',          cat:'warm',    icon:'fi-sr-star',              bg:'linear-gradient(135deg,rgba(245,197,24,.55),rgba(198,145,0,.4))',    color:'#ffd740', tags:'yellow gold'},
  {name:'gold_amber',    label:'Gold+Amber',    cat:'warm',    icon:'fi-sr-coins',             bg:'linear-gradient(135deg,rgba(245,197,24,.6),rgba(255,120,0,.55))',    color:'#ffd740', tags:'yellow orange gold'},
  {name:'bolt_gold',     label:'Bolt+Gold',     cat:'warm',    icon:'fi-sr-bolt-slash',        bg:'linear-gradient(135deg,rgba(255,140,0,.6),rgba(240,200,0,.55))',     color:'#ffcc02', tags:'orange yellow'},
  {name:'magic',         label:'Magic',         cat:'cool',    icon:'fi-sr-wand-magic',        bg:'linear-gradient(135deg,rgba(156,39,176,.55),rgba(106,27,154,.4))',   color:'#e040fb', tags:'purple violet'},
  {name:'lavender',      label:'Lavender',      cat:'cool',    icon:'fi-sr-flower',            bg:'linear-gradient(135deg,rgba(149,117,205,.55),rgba(94,53,177,.4))',   color:'#ce93d8', tags:'purple light'},
  {name:'magic_lavender',label:'Magic+Lavender',cat:'cool',    icon:'fi-sr-sparkles',          bg:'linear-gradient(135deg,rgba(160,30,190,.55),rgba(140,100,220,.55))', color:'#e040fb', tags:'purple'},
  {name:'ocean',         label:'Ocean',         cat:'cool',    icon:'fi-sr-water',             bg:'linear-gradient(135deg,rgba(33,150,243,.55),rgba(13,71,161,.4))',    color:'#40c4ff', tags:'blue sea'},
  {name:'ocean_lavender',label:'Ocean+Lavender',cat:'cool',    icon:'fi-sr-waves',             bg:'linear-gradient(135deg,rgba(30,140,255,.55),rgba(140,90,220,.5))',   color:'#90caff', tags:'blue purple'},
  {name:'ocean_emerald', label:'Ocean+Emerald', cat:'cool',    icon:'fi-sr-rainbow',           bg:'linear-gradient(135deg,rgba(20,140,255,.55),rgba(0,200,160,.5))',    color:'#40c4ff', tags:'blue green'},
  {name:'emerald',       label:'Emerald',       cat:'nature',  icon:'fi-sr-leaf',              bg:'linear-gradient(135deg,rgba(0,188,140,.55),rgba(0,121,107,.4))',     color:'#64ffda', tags:'green teal'},
  {name:'emerald_teal',  label:'Emerald+Teal',  cat:'nature',  icon:'fi-sr-tree',              bg:'linear-gradient(135deg,rgba(0,200,100,.55),rgba(0,230,200,.5))',     color:'#69ffda', tags:'green teal'},
  {name:'silver',        label:'Silver',        cat:'neutral', icon:'fi-sr-shield',            bg:'linear-gradient(135deg,rgba(176,190,197,.3),rgba(96,125,139,.2))',   color:'#eceff1', tags:'gray white'},
  {name:'default',       label:'Default',       cat:'neutral', icon:'fi-sr-layers',            bg:'linear-gradient(135deg,rgba(255,255,255,.1),rgba(255,255,255,.05))', color:'#cfd8dc', tags:'neutral'},
];

const _THEME_CATS = [
  {id:'all',    label:'ทั้งหมด'},
  {id:'warm',   label:'🔥 Warm'},
  {id:'cool',   label:'💠 Cool'},
  {id:'nature', label:'🌿 Nature'},
  {id:'neutral',label:'⬜ Neutral'},
];
let _themeCat = 'all';

function _initThemePicker(currentTheme) {
  const wrap = document.getElementById('df-theme-picker');
  if (!wrap) return;

wrap.innerHTML = `


  <div id="df-theme-preview" style="width:100%;height:68px;border-radius:12px;display:flex;align-items:center;gap:14px;padding:0 18px;font-size:1.6rem;border:1px solid rgba(255,255,255,.08);transition:all .3s;margin-bottom:10px;">
    <i id="df-theme-preview-ico" class="fi fi-sr-flame" style="color:#ff5252;font-size:1.4rem"></i>
    <span id="df-theme-preview-name" style="font-size:.78rem;font-weight:600;opacity:.7;letter-spacing:1px;font-family:'Kanit',sans-serif;"></span>
  </div>
  <div id="df-theme-swatches" style="margin-bottom:8px;max-height:88px;overflow-y:auto;scrollbar-width:none;"></div>
  <div style="height:1px;background:#1e1e1e;margin:10px 0;"></div>
  <div style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:10px;padding:12px;">
    <div style="font-size:.62rem;color:#444;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">Custom gradient</div>
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
        <div id="df-c1-swatch" style="width:44px;height:44px;border-radius:10px;border:2px solid #333;cursor:pointer;position:relative;overflow:hidden;background:#e50914;">
          <input type="color" id="df-color1" value="#e50914" style="position:absolute;inset:-4px;width:calc(100% + 8px);height:calc(100% + 8px);opacity:0;cursor:pointer;">
        </div>
        <span style="font-size:.6rem;color:#555;">สี 1</span>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
        <input id="df-hex1" value="#e50914" maxlength="7" style="width:72px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:7px;padding:5px 6px;color:#fff;font-size:.78rem;font-family:monospace;text-align:center;outline:none;">
        <span style="font-size:.6rem;color:#555;">hex</span>
      </div>
      <span style="color:#333;">→</span>
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
        <div id="df-c2-swatch" style="width:44px;height:44px;border-radius:10px;border:2px solid #333;cursor:pointer;position:relative;overflow:hidden;background:#8b0000;">
          <input type="color" id="df-color2" value="#8b0000" style="position:absolute;inset:-4px;width:calc(100% + 8px);height:calc(100% + 8px);opacity:0;cursor:pointer;">
        </div>
        <span style="font-size:.6rem;color:#555;">สี 2</span>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
        <input id="df-hex2" value="#8b0000" maxlength="7" style="width:72px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:7px;padding:5px 6px;color:#fff;font-size:.78rem;font-family:monospace;text-align:center;outline:none;">
        <span style="font-size:.6rem;color:#555;">hex</span>
      </div>
      <div id="df-custom-preview" style="flex:1;height:44px;border-radius:9px;border:1px solid #2a2a2a;background:linear-gradient(135deg,#e50914cc,#8b000088);transition:.3s;min-width:0;"></div>
    </div>
  </div>
  <input type="hidden" id="df-theme" value="${currentTheme}">
`;
  _renderThemeSwatches(currentTheme);

  // ---- color picker → hex ----
  document.getElementById('df-color1').addEventListener('input', function() {
    document.getElementById('df-hex1').value = this.value;
    document.getElementById('df-c1-swatch').style.background = this.value;
    _applyCustomTheme();
  });
  document.getElementById('df-color2').addEventListener('input', function() {
    document.getElementById('df-hex2').value = this.value;
    document.getElementById('df-c2-swatch').style.background = this.value;
    _applyCustomTheme();
  });

  // ---- hex → color picker ----
  document.getElementById('df-hex1').addEventListener('input', function() {
    let v = this.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      this.style.borderColor = '';
      this.value = v;
      document.getElementById('df-color1').value = v;
      document.getElementById('df-c1-swatch').style.background = v;
      _applyCustomTheme();
    } else {
      this.style.borderColor = '#e50914';
    }
  });
  document.getElementById('df-hex2').addEventListener('input', function() {
    let v = this.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      this.style.borderColor = '';
      this.value = v;
      document.getElementById('df-color2').value = v;
      document.getElementById('df-c2-swatch').style.background = v;
      _applyCustomTheme();
    } else {
      this.style.borderColor = '#e50914';
    }
  });

  // set initial preview
  if (currentTheme.startsWith('custom:')) {
    const [,c1,c2] = currentTheme.split(':');
    document.getElementById('df-color1').value = c1;
    document.getElementById('df-color2').value = c2;
    document.getElementById('df-hex1').value = c1;
    document.getElementById('df-hex2').value = c2;
    document.getElementById('df-c1-swatch').style.background = c1;
    document.getElementById('df-c2-swatch').style.background = c2;
    _applyCustomTheme();
  } else {
    const t = THEME_PRESETS.find(x => x.name === currentTheme) || THEME_PRESETS[0];
    _applyThemePreview(t);
  }
}

function _renderThemeTabs(currentTheme) {
  const el = document.getElementById('df-theme-tabs');
  if (!el) return;
  el.innerHTML = _THEME_CATS.map(c =>
    `<div onclick="_setThemeCat('${c.id}','${currentTheme || ''}')" style="background:${_themeCat===c.id?'rgba(229,9,20,.15)':'#0d0d0d'};border:1px solid ${_themeCat===c.id?'rgba(229,9,20,.4)':'#222'};border-radius:20px;padding:4px 12px;font-size:.72rem;color:${_themeCat===c.id?'#ff5252':'#666'};cursor:pointer;white-space:nowrap;font-family:'Kanit',sans-serif;">${c.label}</div>`
  ).join('');
}

function _setThemeCat(id, cur) {
  _themeCat = id;
  _renderThemeTabs(cur);
  _renderThemeSwatches(cur);
}

function _renderThemeSwatches(currentTheme, searchQ = '') {
  const el = document.getElementById('df-theme-swatches');
  if (!el) return;
  const curSel = currentTheme || document.getElementById('df-theme')?.value || '';
  const q = searchQ.toLowerCase().trim();

  let filtered = THEME_PRESETS.filter(t =>
    (_themeCat === 'all' || t.cat === _themeCat) &&
    (!q || t.label.toLowerCase().includes(q) || t.tags.includes(q) || t.name.includes(q))
  );

  if (!filtered.length) { el.innerHTML = '<div style="text-align:center;padding:16px;color:#444;font-size:.82rem;">ไม่พบธีม</div>'; return; }

  const swatchStyle = `width:100%;padding:8px 4px;border-radius:10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:2px solid transparent;transition:all .18s;`;

  if (_themeCat === 'all' && !q) {
    const groups = {};
    filtered.forEach(t => { if (!groups[t.cat]) groups[t.cat] = []; groups[t.cat].push(t); });
    el.innerHTML = ['warm','cool','nature','neutral'].filter(c => groups[c]).map(cat => {
      const lbl = _THEME_CATS.find(x => x.id === cat)?.label || cat;
      return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">${groups[cat].map(t => _swatchEl(t, curSel)).join('')}</div>`;
    }).join('');
  } else {
    el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">${filtered.map(t => _swatchEl(t, curSel, swatchStyle)).join('')}</div>`;
  }
}

function _swatchEl(t, curSel) {
  const sel = curSel === t.name;
  return `<div style="width:36px;height:36px;border-radius:8px;cursor:pointer;border:2px solid ${sel?'#fff':'transparent'};background:${t.bg};transition:all .15s;display:flex;align-items:center;justify-content:center;flex-shrink:0;" title="${t.label}" onclick="_selectThemePreset('${t.name}')">
    ${sel ? `<span style="color:#fff;font-size:.8rem;">✓</span>` : ''}
  </div>`;
}

function _selectThemePreset(name) {
  const t = THEME_PRESETS.find(x => x.name === name);
  if (!t) return;
  document.getElementById('df-theme').value = name;
  _applyThemePreview(t);
  _renderThemeSwatches(name, document.getElementById('df-theme-search')?.value || '');
}

function _applyThemePreview(t) {
  const prev = document.getElementById('df-theme-preview');
  const ico  = document.getElementById('df-theme-preview-ico');
  const nm   = document.getElementById('df-theme-preview-name');
  if (!prev) return;
  prev.style.background = t.bg;
  if (ico) { ico.className = 'fi ' + t.icon; ico.style.color = t.color; }
  if (nm) nm.textContent = t.label.toUpperCase();
}

function _applyCustomTheme() {
  const c1 = document.getElementById('df-color1').value;
  const c2 = document.getElementById('df-color2').value;
  const bg = `linear-gradient(135deg,${c1}cc,${c2}88)`;
  document.getElementById('df-theme').value = `custom:${c1}:${c2}`;
  const prev = document.getElementById('df-theme-preview');
  const ico  = document.getElementById('df-theme-preview-ico');
  const nm   = document.getElementById('df-theme-preview-name');
  if (prev) prev.style.background = bg;
  if (ico)  { ico.className = 'fi fi-sr-palette'; ico.style.color = c1; }
  if (nm)   nm.textContent = 'CUSTOM';
  const cp = document.getElementById('df-custom-preview');
  if (cp)   cp.style.background = bg;
  document.querySelectorAll('#df-theme-swatches div[onclick]')
    .forEach(s => s.style.borderColor = 'transparent');
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
  // ใส่ต่อจาก document.getElementById('deck-form-ov').classList.add('show');
_initThemePicker(document.getElementById('df-theme').value || 'fire');

// sync preview เมื่อเปลี่ยน icon
document.getElementById('df-icon').oninput = () => {
  _applyThemePreview(
    document.getElementById('df-theme-preview').style.background,
    document.getElementById('df-theme-preview-ico').style.color
  );
};
}

function closeDeckForm() { document.getElementById('deck-form-ov').classList.remove('show'); }
function editDeck(id)    { openDeckForm(id); }

async function saveDeck() {
  const name = document.getElementById('df-name').value.trim();
  if (!name) { toast('กรุณาใส่ชื่อกองไพ่', 'warning'); return; }
  const icon     = document.getElementById('df-icon').value.trim()     || 'fi-sr-flame';
  const theme    = document.getElementById('df-theme').value            || 'default';
  const desc     = document.getElementById('df-desc').value.trim();
  const cost     = parseInt(document.getElementById('df-cost').value)   || 1;
  const category = document.getElementById('df-category').value.trim() || '';

  let deck;
  if (editDeckId) {
    deck = DB.decks.find(x => x.id === editDeckId);
    Object.assign(deck, { name, icon, theme, desc, cost, category });
  } else {
    const id = 'd' + Date.now();
    deck = { id, name, icon, theme, desc, cost, category, hidden: false };
    DB.decks.push(deck);
    DB.cards[deck.id] = [];
  }

  const ok = await saveDeckToDB(deck);
  if (!ok) { toast('เกิดข้อผิดพลาด บันทึกไม่สำเร็จ', 'error'); return; }

  await initDB();
  injectCustomThemes(); // ← เพิ่มบรรทัดนี้
  closeDeckForm();
  renderAdmDecks();
  renderAdmSel();
  renderDecks();
  toast('บันทึกกองไพ่แล้ว', 'success');
}

async function delDeck(id) {
  const ok = await customConfirm('ลบกองไพ่นี้? ไพ่ทั้งหมดจะหายด้วย');
  if (!ok) return;

  // ลบจาก Supabase จริง (cards จะถูกลบ cascade หรือเรียก deleteCardsToDB ก่อน)
  const ok1= await deleteDeckFromDB(id);
  if (!ok1){ toast('เกิดข้อผิดพลาด ลบไม่สำเร็จ', 'error'); return; }

  // อัปเดต memory cache
  DB.decks = DB.decks.filter(d => d.id !== id);
  delete DB.cards[id];

  renderAdmDecks();
  renderAdmSel();
  renderDecks();
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
  document.getElementById('ce-title').innerHTML = `<i class="fi ${d.icon || 'fi-sr-layers'}" style="color:var(--red);"></i> ${d.name} - แก้ไขไพ่`;
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

async function saveCards() {
  const id = document.getElementById('adm-deck-sel').value;
  if (!id) { toast('เลือกกองไพ่ก่อน', 'warning'); return; }

  const rows = document.querySelectorAll('#card-list-ed .ced-row');
  const cards = [];
  rows.forEach(r => {
    const ins  = r.querySelectorAll('input');
    const cat  = ins[0].value.trim() || 'ทั่วไป';
    const text = ins[1].value.trim();
    if (text) cards.push({ cat, text });
  });

  // บันทึกไป Supabase
  const ok = await saveCardsToDB(id, cards);
  if (!ok) { toast('เกิดข้อผิดพลาด บันทึกไม่สำเร็จ', 'error'); return; }

  await initDB(); // reload จาก Supabase
  renderAdmDecks();
  toast(`บันทึก ${cards.length} ใบแล้ว`, 'success');
}

/* ---- SETTINGS ---- */
async function saveSettings() {
  DB.settings.startCredit  = parseInt(document.getElementById('st-cr').value)    || 10;
  DB.settings.siteName     = document.getElementById('st-nm').value              || 'DRINKORDOOM';
  DB.settings.testMode     = parseInt(document.getElementById('st-test').value);
  DB.settings.showModal    = parseInt(document.getElementById('st-modal').value);
  DB.settings.defaultCost  = parseInt(document.getElementById('st-cost').value)  || 1;
  DB.settings.topupEnabled = parseInt(document.getElementById('st-topup').value);
  DB.settings.deckLayout   = document.getElementById('st-layout').value          || 'auto';

  // ✅ บันทึกขึ้น Supabase
  const rows = Object.entries(DB.settings).map(([key, value]) => ({
    key,
    value: String(value)
  }));

  const { error } = await _sb
    .from('app_settings')
    .upsert(rows, { onConflict: 'key' });

  if (error) {
    console.error('saveSettings error:', error);
    toast('บันทึกไม่สำเร็จ: ' + error.message, 'error');
    return;
  }

  saveDB(); // ยังเก็บ localStorage ไว้เป็น cache
  applyTestMode();
  toast('บันทึกการตั้งค่าแล้ว', 'success');
}

// [FIX] connectSheet นิยามครั้งเดียวที่นี่ - ลบออกจาก api.js แล้ว
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
    .catch(() => toast('เชื่อมต่อไม่ได้ - ตรวจสอบ URL และ Share settings', 'error'));
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
/* ---- SETTINGS TAB ---- */
async function loadSettingsTab() {
  // โหลด packages list ในแท็บตั้งค่า
  if (typeof loadPkgList === 'function') await loadPkgList();

  // sync ค่า settings fields
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('st-cr',    DB.settings?.startCredit  ?? 10);
  setVal('st-nm',    DB.settings?.siteName     ?? 'DRINKORDOOM');
  setVal('st-test',  DB.settings?.testMode     ?? 1);
  setVal('st-modal', DB.settings?.showModal    ?? 1);
  setVal('st-cost',  DB.settings?.defaultCost  ?? 1);
  setVal('st-topup', DB.settings?.topupEnabled ?? 1);
}

/* ---- PACKAGE MANAGER ---- */
let editPkgId = null;

async function loadPkgList() {
  const el = document.getElementById('pkg-list');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--text3);font-size:.85rem;">กำลังโหลด...</p>';

  const { data, error } = await _sb
    .from('packages')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error || !data?.length) {
    el.innerHTML = '<p style="color:var(--text3);">ไม่พบแพ็กเกจ</p>';
    return;
  }

  el.innerHTML = data.map(p => `
    <div class="pkg-row ${!p.is_active ? 'pkg-inactive' : ''}">
      <div class="pkg-row-ico ${p.is_featured ? 'pkg-ico-featured' : ''}">
        <i class="fi fi-sr-coins"></i>
      </div>
      <div class="pkg-row-info">
        <div class="pkg-row-top">
          <span class="pkg-row-name">${p.name}</span>
          ${p.is_featured ? '<span class="pkg-badge pkg-badge-featured"><i class="fi fi-sr-star"></i> แนะนำ</span>' : ''}
          ${!p.is_active ? '<span class="pkg-badge pkg-badge-off">ซ่อน</span>' : ''}
        </div>
        <div class="pkg-row-detail">
          <span><i class="fi fi-sr-coins"></i> ${p.coins} เครดิต${p.bonus > 0 ? ` +${p.bonus} โบนัส` : ''}</span>
          <span class="pkg-sep">·</span>
          <span><i class="fi fi-sr-baht-sign"></i> ฿${p.price} บาท</span>
          <span class="pkg-sep">·</span>
          <span>ลำดับ ${p.sort_order}</span>
        </div>
      </div>
      <div class="pkg-row-acts">
        <button class="btn-sm btn-edit" onclick="openPkgForm('${p.id}')">
          <i class="fi fi-sr-edit"></i> แก้ไข
        </button>
        <button class="btn-sm ${p.is_active ? 'btn-hidden' : 'btn-visible'}" onclick="togglePkg('${p.id}', ${!p.is_active})">
          <i class="fi fi-sr-eye${p.is_active ? '-crossed' : ''}"></i>
        </button>
        <button class="btn-sm btn-del" onclick="deletePkg('${p.id}')">
          <i class="fi fi-sr-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function openPkgForm(id = null) {
  editPkgId = id;
  if (id) {
    _sb.from('packages').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      document.getElementById('pf-title').innerHTML = '<i class="fi fi-sr-edit" style="color:var(--red);"></i> แก้ไขแพ็กเกจ';
      document.getElementById('pf-name').value     = data.name;
      document.getElementById('pf-coins').value    = data.coins;
      document.getElementById('pf-bonus').value    = data.bonus;
      document.getElementById('pf-price').value    = data.price;
      document.getElementById('pf-featured').value = data.is_featured ? '1' : '0';
      document.getElementById('pf-order').value    = data.sort_order;
      document.getElementById('pf-active').value   = data.is_active ? '1' : '0';
    });
  } else {
    document.getElementById('pf-title').innerHTML = '<i class="fi fi-sr-coins" style="color:var(--red);"></i> เพิ่มแพ็กเกจ';
    ['pf-name','pf-coins','pf-bonus','pf-price'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('pf-bonus').value    = '0';
    document.getElementById('pf-featured').value = '0';
    document.getElementById('pf-order').value    = '0';
    document.getElementById('pf-active').value   = '1';
  }
  document.getElementById('pkg-form-ov').classList.add('show');
}

function closePkgForm() {
  document.getElementById('pkg-form-ov').classList.remove('show');
  editPkgId = null;
}

async function savePkg() {
  const name     = document.getElementById('pf-name').value.trim();
  const coins    = parseInt(document.getElementById('pf-coins').value);
  const bonus    = parseInt(document.getElementById('pf-bonus').value) || 0;
  const price    = parseInt(document.getElementById('pf-price').value);
  const featured = document.getElementById('pf-featured').value === '1';
  const order    = parseInt(document.getElementById('pf-order').value) || 0;
  const active   = document.getElementById('pf-active').value === '1';

  if (!name || !coins || !price) { toast('กรุณากรอกข้อมูลให้ครบ', 'warning'); return; }

  const payload = { name, coins, bonus, price, is_featured: featured, sort_order: order, is_active: active };

  const { error } = editPkgId
    ? await _sb.from('packages').update(payload).eq('id', editPkgId)
    : await _sb.from('packages').insert(payload);

  if (error) { toast('เกิดข้อผิดพลาด: ' + error.message, 'error'); return; }

  toast(editPkgId ? 'แก้ไขแพ็กเกจแล้ว' : 'เพิ่มแพ็กเกจแล้ว', 'success');
  closePkgForm();
  loadPkgList();
  loadPackages(); // รีโหลดหน้าเติมเครดิตด้วย
}

async function togglePkg(id, active) {
  const { error } = await _sb.from('packages').update({ is_active: active }).eq('id', id);
  if (error) { toast('เกิดข้อผิดพลาด', 'error'); return; }
  toast(active ? 'เปิดแพ็กเกจแล้ว' : 'ซ่อนแพ็กเกจแล้ว', active ? 'success' : 'info');
  loadPkgList();
}

async function deletePkg(id) {
  const ok = await customConfirm('ลบแพ็กเกจนี้?');
  if (!ok) return;
  const { error } = await _sb.from('packages').delete().eq('id', id);
  if (error) { toast('เกิดข้อผิดพลาด', 'error'); return; }
  toast('ลบแพ็กเกจแล้ว', 'info');
  loadPkgList();
}
/* =========================================
   DECK DUPLICATOR
   ========================================= */
async function duplicateDeck(srcId) {
  const src = DB.decks.find(d => d.id === srcId);
  if (!src) return;

  const newName = await customPrompt(`ชื่อกองไพ่ใหม่:`, `${src.name} (สำเนา)`);
  if (!newName?.trim()) return;

  const newId   = 'd' + Date.now();
  const newDeck = { ...src, id: newId, name: newName.trim(), hidden: false };

  // บันทึก deck ใหม่
  const deckOk = await saveDeckToDB(newDeck);
  if (!deckOk) { toast('เกิดข้อผิดพลาด ก็อปกองไพ่ไม่สำเร็จ', 'error'); return; }

  // ก็อปไพ่ทั้งหมด
  const srcCards = DB.cards[srcId] || [];
  if (srcCards.length) {
    const cardOk = await saveCardsToDB(newId, srcCards);
    if (!cardOk) { toast('ก็อปกองไพ่สำเร็จ แต่ไพ่บางส่วนอาจไม่ครบ', 'warning'); }
  }

  await initDB();
  renderAdmDecks();
  renderAdmSel();
  renderDecks();
  toast(`ก็อปปี้ "${newName.trim()}" สำเร็จ! ${srcCards.length} ใบ`, 'success');
}

/* =========================================
   CARD SEARCH & FILTER
   ========================================= */
let _csShowDup = false;

function initCardSearch() {
  const deckSel = document.getElementById('cs-deck');
  if (!deckSel) return;
  deckSel.innerHTML = '<option value="">ทุกกอง</option>';
  DB.decks.forEach(d => {
    const o = document.createElement('option');
    o.value = d.id; o.textContent = d.name;
    deckSel.appendChild(o);
  });

  const catSel = document.getElementById('cs-cat');
  if (catSel) {
    const cats = new Set();
    Object.values(DB.cards).forEach(arr => arr.forEach(c => cats.add(c.cat || 'ทั่วไป')));
    catSel.innerHTML = '<option value="">ทุกหมวด</option>';
    [...cats].sort().forEach(cat => {
      const o = document.createElement('option');
      o.value = cat; o.textContent = cat;
      catSel.appendChild(o);
    });
  }

  _csShowDup = false;
  const dupBtn = document.getElementById('cs-dup-btn');
  if (dupBtn) dupBtn.style.background = 'rgba(245,197,24,.08)';

  // ✅ เพิ่มปุ่มลบซ้ำถ้ายังไม่มี
  const toolbar = dupBtn?.parentElement;
  if (toolbar && !document.getElementById('cs-del-dup-btn')) {
    const delBtn = document.createElement('button');
    delBtn.id = 'cs-del-dup-btn';
    delBtn.innerHTML = '<i class="fi fi-sr-trash"></i> ลบคำซ้ำ';
    delBtn.style.cssText = `
      display:flex;align-items:center;gap:6px;
      background:rgba(229,9,20,.08);border:1px solid rgba(229,9,20,.25);
      color:var(--red);padding:8px 14px;border-radius:8px;cursor:pointer;
      font-family:'Kanit',sans-serif;font-size:.85rem;font-weight:600;
      white-space:nowrap;transition:all .2s;
    `;
    delBtn.onmouseover = () => delBtn.style.background = 'rgba(229,9,20,.18)';
    delBtn.onmouseout  = () => delBtn.style.background = 'rgba(229,9,20,.08)';
    delBtn.onclick = removeDuplicateCards;
    toolbar.appendChild(delBtn);
  }

  runCardSearch();
}

function toggleDupFilter() {
  _csShowDup = !_csShowDup;
  const btn = document.getElementById('cs-dup-btn');
  if (btn) {
    btn.style.background = _csShowDup
      ? 'rgba(245,197,24,.25)' : 'rgba(245,197,24,.08)';
    btn.style.borderColor = _csShowDup ? 'var(--gold)' : 'rgba(245,197,24,.25)';
  }
  runCardSearch();
}

async function removeDuplicateCards() {
  const deckId = document.getElementById('cs-deck')?.value || '';

  // กำหนด scope: กองที่เลือก หรือทุกกอง
  const targetDecks = deckId
    ? DB.decks.filter(d => d.id === deckId)
    : DB.decks;

  // นับว่าจะลบกี่ใบรวม
  let totalRemoved = 0;
  const summary = [];

  for (const deck of targetDecks) {
    const cards = DB.cards[deck.id] || [];
    const seen  = new Set();
    const deduped = [];

    for (const card of cards) {
      if (!seen.has(card.text)) {
        seen.add(card.text);
        deduped.push(card);
      }
    }

    const removed = cards.length - deduped.length;
    if (removed > 0) {
      totalRemoved += removed;
      summary.push(`"${deck.name}" ลบ ${removed} ใบ`);
    }
  }

  if (totalRemoved === 0) {
    toast('ไม่พบไพ่ซ้ำในกองที่เลือก', 'info');
    return;
  }

  // confirm ก่อนลบจริง
  const ok = await customConfirm(
    `พบไพ่ซ้ำ ${totalRemoved} ใบ\n${summary.join('\n')}\n\nยืนยันลบออก?`
  );
  if (!ok) return;

  // ลบจริงใน DB และ Supabase
  let hasError = false;
  for (const deck of targetDecks) {
    const cards = DB.cards[deck.id] || [];
    const seen  = new Set();
    const deduped = [];

    for (const card of cards) {
      if (!seen.has(card.text)) {
        seen.add(card.text);
        deduped.push(card);
      }
    }

    if (deduped.length !== cards.length) {
      const ok2 = await saveCardsToDB(deck.id, deduped);
      if (ok2) {
        DB.cards[deck.id] = deduped;
      } else {
        hasError = true;
      }
    }
  }

  if (hasError) {
    toast('บันทึกบางกองไม่สำเร็จ', 'error');
  } else {
    toast(`ลบไพ่ซ้ำ ${totalRemoved} ใบแล้ว`, 'success');
  }

  await initDB();
  renderAdmDecks();
  runCardSearch();
}

function runCardSearch() {
  const query    = (document.getElementById('cs-query')?.value || '').trim().toLowerCase();
  const deckId   = document.getElementById('cs-deck')?.value  || '';
  const catFilt  = document.getElementById('cs-cat')?.value   || '';
  const results  = document.getElementById('cs-results');
  const summary  = document.getElementById('cs-summary');
  if (!results) return;

  // รวมไพ่ทั้งหมด + แนบ deck info
  let all = [];
  DB.decks.forEach(d => {
    (DB.cards[d.id] || []).forEach((c, i) => {
      all.push({ deck: d, cat: c.cat || 'ทั่วไป', text: c.text, idx: i });
    });
  });

  // filter by deck
  if (deckId) all = all.filter(c => c.deck.id === deckId);
  // filter by category
  if (catFilt) all = all.filter(c => c.cat === catFilt);
  // filter by search query
  if (query) all = all.filter(c => c.text.toLowerCase().includes(query));

  // filter duplicates (same text ใน deck เดียวกัน หรือข้ามกองก็ได้)
  if (_csShowDup) {
    const textCount = {};
    all.forEach(c => { textCount[c.text] = (textCount[c.text] || 0) + 1; });
    all = all.filter(c => textCount[c.text] > 1);
  }

  // summary
  const totalShown = all.length;
  summary.textContent = totalShown
    ? `พบ ${totalShown} ใบ${_csShowDup ? ' (ข้อความซ้ำ)' : ''}`
    : 'ไม่พบไพ่ที่ตรงกัน';

  if (!all.length) {
    results.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text3);">
        <i class="fi fi-sr-search" style="font-size:2rem;opacity:.3;"></i>
        <div style="margin-top:10px;font-size:.85rem;">ไม่พบไพ่</div>
      </div>`;
    return;
  }

  // highlight matching text
  function hl(text) {
    if (!query) return text;
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(re, '<mark style="background:rgba(229,9,20,.3);color:#fff;border-radius:2px;padding:0 2px;">$1</mark>');
  }

  results.innerHTML = all.map(c => {
    const th = getTh(c.deck);
    return `
    <div style="
      display:flex;align-items:center;gap:12px;
      background:#161616;border:1px solid #1e1e1e;
      border-radius:10px;padding:10px 14px;
      transition:border-color .2s;
    " onmouseover="this.style.borderColor='#2a2a2a'" onmouseout="this.style.borderColor='#1e1e1e'">
      <div class="drow-ico ${th}" style="width:32px;height:32px;font-size:.78rem;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;">
        <i class="fi ${c.deck.icon || 'fi-sr-layers'}"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:.88rem;line-height:1.4;">${hl(c.text)}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
          <span style="font-size:.72rem;color:var(--text3);">${c.deck.name}</span>
          <span style="color:#333;font-size:.6rem;">·</span>
          <span style="font-size:.7rem;color:var(--text2);background:#1a1a1a;border:1px solid #2a2a2a;
                       border-radius:20px;padding:1px 8px;">${c.cat}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function confirmReset() {
  const ok = await customConfirm('รีเซ็ตข้อมูลทั้งหมด?');
  if (!ok) return;
  resetDB();
  renderAdmDecks();
  renderAdmSel();
  toast('รีเซ็ตแล้ว', 'info');
}

/* =========================================
   CUSTOM CONFIRM / PROMPT DIALOGS
   ========================================= */
function customConfirm(message) {
  return new Promise(resolve => {
    document.getElementById('custom-confirm-ov')?.remove();
    const ov = document.createElement('div');
    ov.id = 'custom-confirm-ov';
    ov.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.75);
      z-index:9999;display:flex;align-items:center;justify-content:center;
      backdrop-filter:blur(4px);
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
    ov.addEventListener('click', e => { if (e.target === ov) { ov.remove(); resolve(false); } });
    document.body.appendChild(ov);
  });
}

function customPrompt(message, defaultValue = '') {
  return new Promise(resolve => {
    document.getElementById('custom-prompt-ov')?.remove();
    const ov = document.createElement('div');
    ov.id = 'custom-prompt-ov';
    ov.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.75);
      z-index:9999;display:flex;align-items:center;justify-content:center;
      backdrop-filter:blur(4px);
    `;
    ov.innerHTML = `
      <div style="
        background:linear-gradient(145deg,#1c1c1c,#111);
        border:1px solid #2a2a2a;border-radius:16px;
        padding:28px 28px 22px;max-width:340px;width:90%;
        position:relative;box-shadow:0 20px 60px rgba(0,0,0,.8);
      ">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;
          background:linear-gradient(90deg,transparent,var(--red),transparent);
          border-radius:16px 16px 0 0;"></div>
        <div style="font-family:'Kanit',sans-serif;font-size:.95rem;font-weight:600;
          margin-bottom:14px;color:#fff;" id="cp-msg"></div>
        <input id="cp-input" type="text" style="
          width:100%;background:#151515;border:1px solid #2a2a2a;border-radius:8px;
          color:#fff;padding:10px 12px;font-family:'Kanit',sans-serif;font-size:.95rem;
          outline:none;box-sizing:border-box;margin-bottom:18px;
        ">
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="cp-cancel" style="
            background:transparent;border:1px solid #333;color:var(--text2);
            padding:9px 20px;border-radius:8px;cursor:pointer;
            font-family:'Kanit',sans-serif;font-size:.88rem;
          ">ยกเลิก</button>
          <button id="cp-ok" style="
            background:var(--red);border:none;color:#fff;
            padding:9px 20px;border-radius:8px;cursor:pointer;
            font-family:'Kanit',sans-serif;font-size:.88rem;font-weight:700;
          ">ตกลง</button>
        </div>
      </div>
    `;
    ov.querySelector('#cp-msg').textContent = message;
    const inp = ov.querySelector('#cp-input');
    inp.value = defaultValue;
    const confirm = () => { ov.remove(); resolve(inp.value.trim() || null); };
    ov.querySelector('#cp-ok').onclick     = confirm;
    ov.querySelector('#cp-cancel').onclick = () => { ov.remove(); resolve(null); };
    ov.addEventListener('click', e => { if (e.target === ov) { ov.remove(); resolve(null); } });
    document.body.appendChild(ov);
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') { ov.remove(); resolve(null); }
    });
  });
}

/* =========================================
   BULK PASTE & MULTI ADD
   ========================================= */
function addMultiRows(n = 5) {
  const id = document.getElementById('adm-deck-sel').value;
  if (!id) { toast('เลือกกองไพ่ก่อน', 'warning'); return; }
  for (let i = 0; i < n; i++) addCRow();
  toast(`เพิ่ม ${n} ช่องแล้ว`, 'info');
}

function openBulkPaste() {
  const id = document.getElementById('adm-deck-sel').value;
  if (!id) { toast('เลือกกองไพ่ก่อน', 'warning'); return; }

  document.getElementById('bulk-paste-ov')?.remove();
  const ov = document.createElement('div');
  ov.id = 'bulk-paste-ov';
  ov.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.88);
    z-index:700;display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(6px);
  `;
  ov.addEventListener('click', e => { if (e.target === ov) closeBulkPaste(); });
  ov.innerHTML = `
    <div style="
      background:linear-gradient(145deg,#181818,#101010);
      border:1px solid #2a2a2a;border-radius:20px;
      padding:28px 24px;max-width:520px;width:94%;position:relative;
    ">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;
        background:linear-gradient(90deg,transparent,var(--red),transparent);
        border-radius:20px 20px 0 0;"></div>
      <div style="font-family:'Kanit',sans-serif;font-weight:800;font-size:1.1rem;letter-spacing:2px;margin-bottom:6px;">
        <i class="fi fi-sr-copy-alt" style="color:var(--red);"></i> วางไพ่หลายใบพร้อมกัน
      </div>
      <div style="color:var(--text3);font-size:.78rem;margin-bottom:14px;">
        1 บรรทัด = 1 ใบ &nbsp;·&nbsp; รูปแบบ:
        <code style="background:#222;padding:1px 5px;border-radius:4px;">ข้อความ</code>
        หรือ <code style="background:#222;padding:1px 5px;border-radius:4px;">หมวด | ข้อความ</code>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;">
        <label style="font-size:.8rem;color:var(--text2);white-space:nowrap;">หมวดเริ่มต้น:</label>
        <input id="bulk-default-cat" type="text" placeholder="ทั่วไป" style="
          flex:1;background:#151515;border:1px solid #2a2a2a;border-radius:6px;
          color:#fff;padding:6px 10px;font-family:'Kanit',sans-serif;font-size:.85rem;outline:none;">
      </div>
      <textarea id="bulk-textarea" placeholder="วางข้อความที่นี่...\nเช่น:\nดื่มเบียร์ 1 แก้ว\nทำท่าตลก\nพรีเมียม | ดื่ม 3 แก้วรัวๆ" style="
        width:100%;height:220px;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:10px;
        color:#fff;padding:12px;font-family:'Kanit',sans-serif;font-size:.88rem;
        line-height:1.7;resize:vertical;outline:none;box-sizing:border-box;
      "></textarea>
      <div id="bulk-preview-count" style="font-size:.75rem;color:var(--text3);margin:6px 0 14px;min-height:18px;"></div>
      <div style="display:flex;gap:10px;">
        <button onclick="closeBulkPaste()" style="
          flex:1;background:transparent;border:1px solid #333;color:var(--text2);
          padding:11px;border-radius:8px;cursor:pointer;
          font-family:'Kanit',sans-serif;font-size:.88rem;
        ">ยกเลิก</button>
        <button onclick="applyBulkPaste()" style="
          flex:2;background:var(--red);border:none;color:#fff;
          padding:11px;border-radius:8px;cursor:pointer;
          font-family:'Kanit',sans-serif;font-weight:700;font-size:.95rem;
          display:flex;align-items:center;justify-content:center;gap:8px;
        "><i class="fi fi-sr-add"></i> เพิ่มไพ่</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  const ta = ov.querySelector('#bulk-textarea');
  const pc = ov.querySelector('#bulk-preview-count');
  ta.addEventListener('input', () => {
    const lines = ta.value.split('\n').filter(l => l.trim());
    pc.textContent = lines.length ? `จะเพิ่ม ${lines.length} ใบ` : '';
  });
  ta.focus();
}

function closeBulkPaste() {
  document.getElementById('bulk-paste-ov')?.remove();
}

function applyBulkPaste() {
  const ta     = document.getElementById('bulk-textarea');
  const defCat = (document.getElementById('bulk-default-cat')?.value.trim()) || 'ทั่วไป';
  const lines  = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) { toast('ไม่มีข้อความ', 'warning'); return; }
  lines.forEach(line => {
    if (line.includes('|')) {
      const [cat, ...rest] = line.split('|');
      addCRow(rest.join('|').trim(), cat.trim() || defCat);
    } else {
      addCRow(line, defCat);
    }
  });
  closeBulkPaste();
  toast(`เพิ่ม ${lines.length} ใบแล้ว - กด "บันทึก" เพื่อบันทึก`, 'success');
}


const PAYMENT_CONFIG = {
  provider: null,
  apiKey:   null,
  packages: [
    { coins: 10,  price: 29,  bonus: 0  },
    { coins: 30,  price: 79,  bonus: 5  },
    { coins: 60,  price: 149, bonus: 15 },
    { coins: 150, price: 349, bonus: 50 },
  ]
};

let selectedPackage = null;

// [FIX #15] ลบ selPkg ออกจากที่นี่แล้ว — นิยามครั้งเดียวใน app.js
// selPkg ถูก call จาก HTML ด้วย onclick="selPkg(this, amount)"

/* ---- INITIATE PAYMENT ---- */
async function initiatePayment() {
  if (!selectedPackage) { toast('กรุณาเลือกแพ็กเกจก่อน', 'warning'); return; }
  if (!PAYMENT_CONFIG.provider) {
    toast('ระบบชำระเงินกำลังพัฒนา', 'info');
    return;
  }
}

/* ---- ADD CREDITS — บันทึกลง Supabase ---- */
async function applyTopup(amount) {
  if (!currentUser) { toast('กรุณาเข้าสู่ระบบก่อน', 'warning'); return; }
  credits = await API.addCredits(amount);
  updateCr();
  toast(`เติมเครดิตสำเร็จ! +${amount} เครดิต`, 'success');
  closeTopup();
}

/* ---- FREE CREDITS (test mode only)
   [FIX #7] เพิ่ม rate limit ป้องกันกดซ้ำ
   ========================================= */
const FREE_CREDIT_COOLDOWN_MS = 60 * 1000; // 1 นาที

async function freeCredit() {
  if (!currentUser) { toast('กรุณาเข้าสู่ระบบก่อน', 'warning'); openLogin(); return; }
  if (DB.settings?.testMode !== 1) { toast('โหมดทดสอบปิดอยู่', 'warning'); return; }

  // Client-side rate limit (server-side RLS/trigger ควรทำด้วยถ้าเป็นไปได้)
  const lastFreeCr = parseInt(localStorage.getItem('last_free_cr') || '0');
  const now = Date.now();
  if (now - lastFreeCr < FREE_CREDIT_COOLDOWN_MS) {
    const wait = Math.ceil((FREE_CREDIT_COOLDOWN_MS - (now - lastFreeCr)) / 1000);
    toast(`รอ ${wait} วินาทีก่อนรับเครดิตฟรีอีกครั้ง`, 'warning');
    return;
  }

  try {
    localStorage.setItem('last_free_cr', now.toString());
    await applyTopup(10);
    _sb.from('credit_history').insert({
      user_id: currentUser.id,
      amount:  10,
      type:    'free',
      note:    'รับเครดิตฟรี (ทดสอบ)'
    }).then(({ error }) => { if (error) console.warn('history:', error.message); });
  } catch (e) {
    console.error('freeCredit error:', e);
    localStorage.removeItem('last_free_cr'); // ถ้า error ให้ลองใหม่ได้
    toast('เกิดข้อผิดพลาด', 'error');
  }
}

/* ---- PAYMENT HISTORY
   [FIX #20] บันทึกลง Supabase แทน localStorage
   ========================================= */
async function recordPayment(pkg, txId = null) {
  if (!currentUser) return;
  const { error } = await _sb.from('credit_history').insert({
    user_id:  currentUser.id,
    amount:   pkg.coins + pkg.bonus,
    type:     'purchase',
    note:     `ซื้อ ${pkg.coins + pkg.bonus} เครดิต (${pkg.price} บาท) ผ่าน ${PAYMENT_CONFIG.provider || 'unknown'}`,
    tx_id:    txId || ('tx_' + Date.now()),
  });
  if (error) console.error('recordPayment error:', error);
}

// [FIX #20] getPaymentHistory ดึงจาก Supabase แทน localStorage
async function getPaymentHistory() {
  if (!currentUser) return [];
  const { data, error } = await _sb
    .from('credit_history')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('type', 'purchase')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.error(error); return []; }
  return data || [];
}
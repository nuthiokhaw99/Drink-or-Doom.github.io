
const PAYMENT_CONFIG = {
  provider:   null,      // 'omise' | 'stripe' | 'promptpay' | etc.
  apiKey:     null,
  packages: [
    { coins: 10,  price: 29,  bonus: 0  },
    { coins: 30,  price: 79,  bonus: 5  },
    { coins: 60,  price: 149, bonus: 15 },
    { coins: 150, price: 349, bonus: 50 },
  ]
};

let selectedPackage = null;

/* ---- SELECT PACKAGE ---- */
function selPkg(el, amount) {
  document.querySelectorAll('.topup-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
  selectedPackage = PAYMENT_CONFIG.packages.find(p => p.coins === amount) || null;
}

/* ---- INITIATE PAYMENT (placeholder) ---- */
async function initiatePayment() {
  if (!selectedPackage) { toast('กรุณาเลือกแพ็กเกจก่อน', 'warning'); return; }
  if (!PAYMENT_CONFIG.provider) {
    toast('ระบบชำระเงินกำลังพัฒนา', 'info');
    return;
  }
  // TODO: integrate with payment provider
  // const result = await callPaymentAPI(selectedPackage);
  // if (result.success) addCredits(selectedPackage.coins + selectedPackage.bonus);
}

/* ---- ADD CREDITS (called after successful payment) ---- */
function addCredits(amount) {
  credits += amount;
  saveCr();
  updateCr();
  toast(`เติมเครดิตสำเร็จ! +${amount} เครดิต`, 'success');
  closeTopup();
}

/* ---- FREE CREDITS (test mode only) ---- */
function freeCredit() {
  if (!DB.settings.testMode) { toast('โหมดทดสอบปิดอยู่', 'warning'); return; }
  addCredits(10);
}

/* ---- PAYMENT HISTORY (stub) ---- */
function getPaymentHistory() {
  return JSON.parse(localStorage.getItem('ds_payments') || '[]');
}

function recordPayment(pkg, txId = null) {
  const history = getPaymentHistory();
  history.unshift({
    id:       txId || ('tx_' + Date.now()),
    coins:    pkg.coins + pkg.bonus,
    price:    pkg.price,
    date:     new Date().toISOString(),
    provider: PAYMENT_CONFIG.provider
  });
  localStorage.setItem('ds_payments', JSON.stringify(history.slice(0, 50)));
}
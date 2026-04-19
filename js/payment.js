// ═══════════════════════════════════════════════════════════════════
// payment.js — ระบบชำระเงินผ่าน PayNoi (PromptPay QR)
// ═══════════════════════════════════════════════════════════════════

// ── CONFIG OBJECT ────────────────────────────────────────────────
const PAYMENT_CONFIG = {
  // object เก็บ config ของระบบชำระเงินทั้งหมด
  provider: 'paynoi',   // ชื่อ payment provider ที่ใช้ (ใช้เป็น reference / ยังไม่ได้ใช้งานโดยตรง)
  apiKey:   null,       // API key ของ paynoi (เริ่มต้น null รอ set จาก config.js หรือ database)
  packages: []          // array เก็บแพ็กเกจที่โหลดมาจาก database (เริ่มต้นว่าง)
};

// ── STATE VARIABLES ──────────────────────────────────────────────
let selectedPackage  = null; // แพ็กเกจที่ผู้ใช้เลือกอยู่ตอนนี้ (null = ยังไม่เลือก)
let _paynoiTransId   = null; // transaction ID ที่ได้จาก paynoi หลังสร้าง QR (ใช้ตอน poll + cancel)
let _pollInterval    = null; // reference ของ setInterval สำหรับ polling (ใช้ clearInterval ภายหลัง)

// ── PAYNOI PROXY URL ─────────────────────────────────────────────
// บรรทัด 19 — เปลี่ยน
const PAYNOI_PROXY = 'https://wslevsdsbcqjndskwyhz.supabase.co/functions/v1/confix-payment';
// URL ของ Supabase Edge Function ที่ทำหน้าที่เป็น proxy กลาง
// เหตุผลที่ต้องมี proxy: ซ่อน secret key ของ paynoi ไม่ให้ client รู้ และ bypass CORS

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTION — ส่ง request ไปยัง paynoi proxy
// ═══════════════════════════════════════════════════════════════════

/* ✅ helper เดียว — ใช้ทุกที่ ไม่ต้องซ้ำ header */
async function _paynoiCall(body) {
  // ฟังก์ชัน helper กลาง: ทุก request ไป paynoi ต้องผ่านฟังก์ชันนี้
  // ขึ้นต้นด้วย _ = convention บอกว่าเป็น private function (ใช้ภายในไฟล์นี้เท่านั้น)
  // รับ body = object ที่จะส่งเป็น JSON ไปยัง proxy

  const { data: { session } } = await _sb.auth.getSession();
  // ดึง session ปัจจุบันจาก Supabase Auth
  // destructuring: { data: { session } } แกะ session ออกมาจาก response
  // _sb = Supabase client (นิยามใน config.js)

  if (!session) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  // ถ้าไม่มี session = ยังไม่ได้ login → throw Error หยุดการทำงานทันที
  // caller ต้อง try-catch รับ error นี้

  const res = await fetch(PAYNOI_PROXY, {
    // เรียก Supabase Edge Function ผ่าน fetch API
    method:  'POST',            // ใช้ POST เพราะส่งข้อมูลไปด้วย
    headers: {
      'Content-Type':  'application/json',           // บอกว่า body เป็น JSON
      'Authorization': 'Bearer ' + session.access_token
      // ส่ง JWT token ของผู้ใช้ไปด้วย Edge Function จะตรวจสอบว่า user valid
    },
    body: JSON.stringify(body)  // แปลง object เป็น JSON string ก่อนส่ง
  });
  return res.json();
  // แปลง response เป็น JavaScript object แล้ว return กลับไป
}

// ═══════════════════════════════════════════════════════════════════
// LOAD PACKAGES — โหลดแพ็กเกจเติมเครดิตจาก Supabase
// ═══════════════════════════════════════════════════════════════════

/* ---- LOAD PACKAGES จาก Supabase ---- */
async function loadPackages() {
  // โหลดแพ็กเกจที่ active ทั้งหมดจาก table 'packages' แล้ว render ลง UI

  const { data, error } = await _sb
    .from('packages')               // query จาก table 'packages'
    .select('*')                    // เลือกทุก column
    .eq('is_active', true)          // กรองเฉพาะแพ็กเกจที่เปิดใช้งาน (is_active = true)
    .order('sort_order', { ascending: true });
    // เรียงตาม sort_order น้อย→มาก (ตัวเลขน้อย = แสดงก่อน)

  const grid = document.querySelector('.topup-grid');
  // หา element .topup-grid ใน DOM (กล่องแสดงแพ็กเกจใน modal เติมเครดิต)

  if (error) {
    // ถ้า Supabase return error
    console.error('loadPackages error:', error); // log error เพื่อ debug
    if (grid) grid.innerHTML = '<p style="color:var(--red);font-size:.85rem;text-align:center;padding:24px;">โหลดแพ็กเกจไม่สำเร็จ กรุณาลองใหม่</p>';
    // แสดงข้อความ error แดงใน grid (ถ้า grid มีอยู่)
    return; // หยุดการทำงาน
  }

  if (!data?.length) {
    // ?.length = optional chaining: ถ้า data เป็น null/undefined จะไม่ crash
    // ถ้าไม่มีข้อมูล (array ว่าง หรือ null)
    if (grid) grid.innerHTML = '<p style="color:var(--text3);font-size:.85rem;text-align:center;padding:24px;">ยังไม่มีแพ็กเกจในระบบ</p>';
    return; // หยุดการทำงาน
  }

  PAYMENT_CONFIG.packages = data.map(p => ({
    // แปลง array ข้อมูลจาก database เก็บเข้า PAYMENT_CONFIG.packages
    // .map() สร้าง array ใหม่โดยแปลงแต่ละ element
    id:       p.id,           // ID ของแพ็กเกจ (UUID จาก Supabase)
    coins:    p.coins,        // จำนวนเครดิตหลัก
    bonus:    p.bonus,        // โบนัสเครดิต
    price:    p.price,        // ราคาบาท
    featured: p.is_featured,  // เป็นแพ็กเกจแนะนำหรือไม่
    name:     p.name          // ชื่อแพ็กเกจ
  }));

  const featuredList = data.filter(p => p.is_featured);
  // แยก array แพ็กเกจ featured (โปรโมชั่นแนะนำ) ออกมา
  // .filter() คืน array ใหม่ที่มีเฉพาะ element ที่ผ่านเงื่อนไข

  const normal = data.filter(p => !p.is_featured);
  // แยก array แพ็กเกจปกติ (ไม่ featured)

  if (!grid) return;
  // ถ้าไม่เจอ .topup-grid ใน DOM ก็หยุดทำงาน (ป้องกัน error)

  const normalHTML = normal.length ? `
    <div class="topup-row-small">
      ${normal.map(p => `
        <div class="topup-opt" onclick="selPkg(this, ${p.coins}, '${p.id}')">
        <!-- แต่ละแพ็กเกจปกติ: คลิกแล้วเรียก selPkg() ส่ง element นี้, จำนวนเครดิต, และ id -->

          <div class="pkg-coins"><i class="fi fi-sr-coins"></i> ${p.coins}</div>
          <!-- แสดงเครดิตรวม = coins + bonus -->

          <div class="pkg-price">฿${p.price} บาท</div>
          <!-- ราคาที่ต้องจ่าย -->

          <div class="pkg-bonus"><i class="fi fi-sr-plus"></i> ${p.bonus > 0 ? p.bonus + ' โบนัส' : p.name}</div>
          <!-- ถ้ามีโบนัส (> 0) แสดง "XX โบนัส", ถ้าไม่มีแสดงชื่อแพ็กเกจแทน
               ternary operator: condition ? valueIfTrue : valueIfFalse -->

        </div>`).join('')}
        <!-- .join('') ต่อ string ใน array เข้าด้วยกันโดยไม่มีตัวคั่น -->
    </div>` : '';
  // ถ้า normal.length === 0 (ไม่มีแพ็กเกจปกติ) ให้ normalHTML เป็น string ว่าง

  const featuredHTML = featuredList.map(p => `
    <div class="topup-opt topup-featured topup-big" onclick="selPkg(this, ${p.coins}, '${p.id}')">
    <!-- แพ็กเกจ featured: class เพิ่ม topup-featured และ topup-big ทำให้แสดงใหญ่กว่า -->

      <div class="featured-badge"><i class="fi fi-sr-star"></i> โปรโมชั่นแนะนำ</div>
      <!-- badge ดาว "โปรโมชั่นแนะนำ" มุมบนของ card -->

      <div class="pkg-big-wrap">
      <!-- layout ข้างในแพ็กเกจ featured: flex row -->

        <div class="pkg-coins pkg-coins-big"><i class="fi fi-sr-coins"></i> ${p.coins}</div>
        <!-- จำนวนเครดิตหลัก (ใหญ่) -->

        <div class="pkg-big-right">
          <div class="pkg-price-big">฿${p.price} บาท</div>
          <!-- ราคาขนาดใหญ่ -->

          <div class="pkg-bonus"><i class="fi fi-sr-plus"></i> ${p.bonus} โบนัส</div>
          <!-- โบนัส -->

          <div class="pkg-per">คนเติมเยอะที่สุด</div>
          <!-- ข้อความ social proof (hardcoded) -->

        </div>
      </div>
    </div>`).join('');
  // join('') ต่อ featured cards เข้าด้วยกัน

  grid.innerHTML = normalHTML + featuredHTML;
  // ใส่ HTML ที่สร้างมาเข้าไปใน .topup-grid
  // normalHTML ก่อน featuredHTML (แพ็กเกจเล็กอยู่บน, featured อยู่ล่าง)
}

// ═══════════════════════════════════════════════════════════════════
// INITIATE PAYMENT — เริ่มกระบวนการชำระเงิน สร้าง QR Code
// ═══════════════════════════════════════════════════════════════════
async function initiatePayment() {
  if (_paynoiTransId) {
    toast('มี QR ค้างอยู่ กรุณารอหมดเวลา (~15 นาที) หรือสแกนจ่ายก่อน', 'warning')
    return
  }

  if (!selectedPackage) { toast('กรุณาเลือกแพ็กเกจก่อน', 'warning'); return; }
  if (!currentUser)     { toast('กรุณาเข้าสู่ระบบก่อน', 'warning'); openLogin(); return; }

  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { toast('Session หมดอายุ กรุณา login ใหม่', 'warning'); openLogin(); return; }

  _stopPolling();

  const btnPay = document.getElementById('btn-confirm-pay');
  if (btnPay) { btnPay.disabled = true; btnPay.innerHTML = '<i class="fi fi-sr-spinner fi-spin"></i> กำลังสร้าง QR...'; }

  try {
    const ref1 = `uid_${currentUser.id}_${Date.now()}`;

    const data = await _paynoiCall({
      method: 'create',
      amount: selectedPackage.price,
      ref1,
    });

    if (!data || data.status !== 1) {
      throw new Error(data?.msg || 'สร้าง QR ไม่สำเร็จ');
    }

    _paynoiTransId = data.trans_id;

    const pendingRows = [
      {
        user_id: currentUser.id,
        amount:  selectedPackage.coins,
        type:    'purchase_pending',
        note:    `รอชำระ ฿${selectedPackage.price} (coins)`,
        tx_id:   data.trans_id
      }
    ];
    if (selectedPackage.bonus > 0) {
      pendingRows.push({
        user_id: currentUser.id,
        amount:  selectedPackage.bonus,
        type:    'bonus_pending',
        note:    `รอชำระ ฿${selectedPackage.price} (bonus)`,
        tx_id:   data.trans_id
      });
    }
    await _sb.from('credit_history').insert(pendingRows);

    _showQRModal(data);
    _startPolling(data.trans_id);

  } catch (e) {
    console.error('initiatePayment error:', e);
    toast(e.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  } finally {
    if (btnPay) { btnPay.disabled = false; btnPay.innerHTML = '<i class="fi fi-sr-credit-card"></i> ชำระเงิน'; }
  }
}
// ═══════════════════════════════════════════════════════════════════
// SHOW QR MODAL — สร้างและแสดง modal QR Code
// ═══════════════════════════════════════════════════════════════════

function _showQRModal(data) {
  // สร้างและแสดง modal QR Code สำหรับให้ผู้ใช้สแกนจ่ายเงิน
  // รับ data = response จาก paynoi (มี qr_image_base64, amount, expire_at, trans_id)

  let qrBox = document.getElementById('qr-pay-modal');
  // หา modal QR ที่อาจสร้างไว้แล้วจากครั้งก่อน

  if (!qrBox) {
    // ถ้ายังไม่มี modal นี้ใน DOM ให้สร้างใหม่
    qrBox = document.createElement('div');  // สร้าง div ใหม่
    qrBox.id = 'qr-pay-modal';              // กำหนด id
    qrBox.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.85);
      z-index:700;display:flex;align-items:center;justify-content:center;
      backdrop-filter:blur(12px);
    `;
    // cssText: set หลาย style พร้อมกัน
    // position:fixed inset:0 = คลุมทั้งหน้าจอ
    // z-index:700 = อยู่บน element อื่นทั้งหมด
    // backdrop-filter:blur = ทำให้พื้นหลังพร่ามัว
    document.body.appendChild(qrBox);
    // แนบ element เข้า DOM ใน body
  }

  const expireAt = new Date(data.expire_at);
  // แปลง expire_at string จาก paynoi เป็น Date object เพื่อคำนวณ countdown

  const qrSrc = data.qr_image_base64?.startsWith('data:')
    ? data.qr_image_base64
    : `data:image/png;base64,${data.qr_image_base64}`;
  // ตรวจว่า qr_image_base64 มี data URI prefix อยู่แล้วหรือยัง
  // ถ้ามีแล้ว (startsWith 'data:') ใช้เลย
  // ถ้าไม่มีให้เติม 'data:image/png;base64,' นำหน้า
  // ?. = optional chaining ป้องกัน crash ถ้า qr_image_base64 เป็น undefined

  qrBox.innerHTML = `
    <div style="
      background:linear-gradient(160deg,#1a1a1a,#111);
      border:1px solid #2a2a2a;
      border-radius:24px;
      padding:28px 24px 24px;
      max-width:min(360px, 92vw);width:92%;
      text-align:center;
      position:relative;
      box-shadow:0 24px 60px rgba(0,0,0,.6);
    ">
    <!-- กล่อง card หลัก: gradient เข้ม, ขอบโค้ง, กว้างสูงสุด 320px -->

      <!-- top accent line -->
      <div style="position:absolute;top:0;left:10%;right:10%;height:2px;
        background:linear-gradient(90deg,transparent,var(--red),transparent);
        border-radius:2px;"></div>
      <!-- เส้นสีแดงตกแต่งบนสุดของ card: position:absolute วางซ้อน -->

      <!-- header -->
      <div style="font-size:.75rem;letter-spacing:3px;color:var(--text3);text-transform:uppercase;margin-bottom:6px;">
        PromptPay QR
      </div>
      <!-- label "PROMPTPAY QR" สไตล์ uppercase ตัวเล็ก -->

      <div style="font-weight:900;font-size:1.25rem;margin-bottom:4px;">
        สแกน<span style="color:var(--red);"> ชำระเงิน</span>
      </div>
      <!-- หัวข้อ "สแกน ชำระเงิน" คำว่า "ชำระเงิน" สีแดง -->

      <div style="font-size:.78rem;color:var(--text2);margin-bottom:18px;">
        หมดเวลาใน
        <span id="qr-countdown" style="color:var(--gold);font-weight:700;font-size:.9rem;">15:00</span>
        นาที
      </div>
      <!-- countdown timer: id="qr-countdown" _startCountdown() จะ update ทุกวินาที -->

      <!-- QR frame -->
      <div style="
        display:inline-block;
        background:#fff;
        border-radius:16px;
        padding:10px;
        box-shadow:0 0 0 1px #333, 0 8px 24px rgba(0,0,0,.4);
      ">
      <!-- กรอบขาวล้อมรอบ QR (QR ต้องมีพื้นขาว จึงอ่านได้) -->

        <img src="${qrSrc}" style="width:clamp(180px,55vw,220px);height:clamp(180px,55vw,220px);display:block;border-radius:8px;" />
        <!-- รูป QR Code: src เป็น base64 image  ขนาด 200x200px -->

      </div>

      <!-- amount -->
      <div style="margin-top:18px;">
        <div style="font-size:.78rem;color:var(--text3);letter-spacing:1px;text-transform:uppercase;">ยอดที่ต้องโอน</div>
        <div style="font-size:2.2rem;font-weight:900;color:var(--gold);line-height:1.1;margin:4px 0;">
          ฿${data.amount}
        </div>
        <!-- ยอดเงินขนาดใหญ่สีทอง: แสดงจาก data.amount ส่งกลับมา -->

        <div style="
          display:inline-flex;align-items:center;gap:6px;
          background:rgba(255,160,0,.08);border:1px solid rgba(255,160,0,.2);
          border-radius:8px;padding:4px 12px;font-size:.72rem;color:var(--gold);margin-top:4px;
        ">
          ⚠️ โอนให้ตรงยอดนี้เท่านั้น (รวมทศนิยม)
        </div>
        <!-- คำเตือนสำคัญ: ถ้าโอนไม่ตรงยอดระบบ detect ไม่ได้ -->

      </div>

      <!-- status -->
      <div id="qr-status-msg" style="
        min-height:28px;font-size:.82rem;color:var(--text2);
        margin:14px 0 10px;
        display:flex;align-items:center;justify-content:center;gap:8px;
      ">
        <i class="fi fi-sr-spinner fi-spin"></i> รอการชำระเงิน...
      </div>
      <!-- ข้อความสถานะ: id="qr-status-msg" _setQRStatus() จะ update ข้อความและสี -->

      <!-- divider -->
      <div style="height:1px;background:#222;margin-bottom:14px;"></div>
      <!-- เส้นแบ่งแนวนอนก่อนปุ่มยกเลิก -->

      <!-- cancel button -->
      <button onclick="_cancelQR()" style="
        width:100%;background:transparent;
        border:1px solid #333;color:var(--text3);
        padding:10px;border-radius:10px;cursor:pointer;
        font-family:'Kanit',sans-serif;font-size:.85rem;
        transition:all .2s;
      "
        onmouseover="this.style.borderColor='#555';this.style.color='#fff'"
        onmouseout="this.style.borderColor='#333';this.style.color='var(--text3)'"
      >
      <!-- ปุ่มยกเลิก: onclick เรียก _cancelQR()
           onmouseover/onmouseout = hover effect เปลี่ยนสีขอบและตัวอักษร (inline JS event) -->
        ยกเลิก
      </button>
    </div>
  `;

  qrBox.style.display = 'flex';
  // แสดง modal (เปลี่ยนจาก 'none' เป็น 'flex')

  _startCountdown(expireAt);
  // เริ่ม countdown timer โดยส่ง expire_at Date object ไป
}

// ═══════════════════════════════════════════════════════════════════
// COUNTDOWN TIMER — นับถอยหลังจนหมดเวลา QR
// ═══════════════════════════════════════════════════════════════════

/* ---- Countdown timer ---- */
let _countdownTimer = null;
// variable เก็บ reference ของ setInterval (ใช้ clearInterval หยุดได้)

function _startCountdown(expireAt) {
  // เริ่มนับถอยหลังจนถึง expireAt Date object

  clearInterval(_countdownTimer);
  // หยุด countdown เก่าก่อน (กรณีเปิด QR ใหม่โดยที่อันเก่ายังค้างอยู่)

  _countdownTimer = setInterval(() => {
    // สร้าง interval ทำงานทุก 1000ms (1 วินาที)

    const el = document.getElementById('qr-countdown');
    // หา element แสดง countdown ใน QR modal

    if (!el) { clearInterval(_countdownTimer); return; }
    // ถ้าไม่เจอ element (modal ถูกปิด/ลบ) ให้หยุด interval ทันที

    const diff = Math.max(0, Math.floor((expireAt - Date.now()) / 1000));
    // คำนวณเวลาที่เหลือเป็นวินาที:
    // expireAt - Date.now() = milliseconds ที่เหลือ
    // / 1000 = แปลงเป็นวินาที
    // Math.floor = ปัดลง (ไม่แสดงทศนิยม)
    // Math.max(0, ...) = ป้องกันค่าติดลบ (เมื่อหมดเวลาแล้ว)

    const m = String(Math.floor(diff / 60)).padStart(2, '0');
    // คำนวณนาที: diff / 60 ปัดลง แปลงเป็น string และเติม 0 ข้างหน้าถ้าน้อยกว่า 2 หลัก
    // padStart(2, '0'): '5' → '05', '12' → '12'

    const s = String(diff % 60).padStart(2, '0');
    // คำนวณวินาที: diff % 60 = เศษจากการหาร 60 (วินาทีที่เหลือหลังหักนาทีออก)

    el.textContent = `${m}:${s}`;
    // อัปเดต text แสดง "MM:SS" เช่น "14:32"

    if (diff === 0) {
      // เมื่อนับถึง 0 (หมดเวลา)
      clearInterval(_countdownTimer); // หยุด interval
      el.textContent = 'หมดเวลา';    // เปลี่ยน text
      el.style.color = 'var(--red)';  // เปลี่ยนสีเป็นแดง
    }
  }, 1000);
  // ทำงานทุก 1000 milliseconds = 1 วินาที
}

// ═══════════════════════════════════════════════════════════════════
// POLLING — ตรวจสถานะการชำระเงินทุก 5 วินาที
// ═══════════════════════════════════════════════════════════════════

/* ---- Polling ตรวจสถานะ ---- */
// [FIX] ลบ creditAmount ออก — client ไม่ควรรู้ว่าจะได้เท่าไหร่
// webhook เป็นคนเพิ่ม credit ให้ client แค่ refresh balance
function _startPolling(transId) {
  let attempts = 0;
  const MAX_ATTEMPTS = 36;

  _pollInterval = setInterval(async () => {
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      _stopPolling();
      _setQRStatus('หมดเวลารอ กรุณาตรวจสอบสถานะใหม่อีกครั้ง', 'warning');
      return;
    }

    try {
      const data = await _paynoiCall({ method: 'check', trans_id: transId });
      // console.log('poll response:', JSON.stringify(data)); // ดู payment_status จริง

      if (!data || data.status !== 1) return;

      if (data.payment_status === 'completed') {
        _stopPolling();
        await _onPaymentSuccess();
      } else if (data.payment_status === 'failed' || data.payment_status === 'expired') {
        _stopPolling();
        _setQRStatus('ธุรกรรมหมดอายุหรือล้มเหลว', 'error');
      }
    } catch (e) {
      console.warn('polling error:', e);
    }
  }, 5000);
}

function _stopPolling() {
  // หยุดทุก interval ที่เกี่ยวกับ payment และ reset state

  clearInterval(_pollInterval);    // หยุด polling interval
  clearInterval(_countdownTimer);  // หยุด countdown interval
  _pollInterval  = null;           // reset ให้เป็น null (garbage collection)
  _paynoiTransId = null;           // reset transaction ID
}

// ═══════════════════════════════════════════════════════════════════
// SET QR STATUS — อัปเดตข้อความสถานะใน QR Modal
// ═══════════════════════════════════════════════════════════════════

function _setQRStatus(msg, type = 'info') {
  // อัปเดตข้อความและสีใน #qr-status-msg
  // msg = ข้อความที่ต้องการแสดง
  // type = 'success' | 'error' | 'info' | 'warning' (default: 'info')

  const el = document.getElementById('qr-status-msg');
  if (!el) return; // ถ้าไม่มี element (modal ปิดแล้ว) ให้หยุด

  const colors = { success: '#4caf50', error: 'var(--red)', info: 'var(--text2)', warning: 'var(--gold)' };
  // map ชื่อ type → CSS color
  // success=เขียว, error=แดง, info=เทา, warning=ทอง

  const icons  = { success: 'fi-sr-check-circle', error: 'fi-sr-cross-circle', info: 'fi-sr-info', warning: 'fi-sr-bell-ring' };
  // map ชื่อ type → Flaticon icon class name

  el.style.color = colors[type] || colors.info;
  // set สีจาก map ถ้าไม่เจอ type ใช้สี info (เทา) เป็น fallback

  el.innerHTML   = `<i class="fi ${icons[type] || icons.info}"></i> ${msg}`;
  // set HTML: icon + space + ข้อความ
}

// ═══════════════════════════════════════════════════════════════════
// ON PAYMENT SUCCESS — ดำเนินการเมื่อชำระเงินสำเร็จ
// ═══════════════════════════════════════════════════════════════════

async function _onPaymentSuccess() {
  _setQRStatus('ชำระเงินสำเร็จ! กำลังโหลดเครดิต...', 'success');

  // ✅ insert ประวัติการซื้อ
  if (selectedPackage) {
    const inserts = [{
      user_id: currentUser.id,
      amount:  selectedPackage.coins,
      type:    'purchase',
      note:    `ซื้อ ${selectedPackage.coins} เครดิต (฿${selectedPackage.price})`,
      tx_id:   _paynoiTransId
    }];
    if (selectedPackage.bonus > 0) {
      inserts.push({
        user_id: currentUser.id,
        amount:  selectedPackage.bonus,
        type:    'bonus',
        note:    `โบนัส ${selectedPackage.bonus} เครดิต จากแพ็กเกจ ฿${selectedPackage.price}`,
        tx_id:   _paynoiTransId
      });
    }
    await _sb.from('credit_history').insert(inserts);
  }

  await loadCredits();
  toast('เติมเครดิตสำเร็จ!', 'success');

  setTimeout(() => {
    _closeQRModal();
    closeTopup();
  }, 1800);
}

// ═══════════════════════════════════════════════════════════════════
// CANCEL / CLOSE QR — ยกเลิกและปิด QR Modal
// ═══════════════════════════════════════════════════════════════════

async function _cancelQR() {
  const transId = _paynoiTransId;
  _stopPolling();

  if (transId) {
    try {
      const res = await _paynoiCall({ method: 'cancel', trans_id: transId });
      // console.log('cancel response:', JSON.stringify(res)); // เพิ่มตรงนี้
    } catch(e) {
      console.error('cancel error:', e); // เปลี่ยนจาก silent เป็น log
    }
  }

  _closeQRModal();
}

function _closeQRModal() {
  // ซ่อน QR modal โดยไม่ลบออกจาก DOM (เพื่อ reuse ครั้งต่อไป)
  const el = document.getElementById('qr-pay-modal');
  if (el) el.style.display = 'none'; // ซ่อน (ยัง exist ใน DOM)
}

// ═══════════════════════════════════════════════════════════════════
// APPLY TOPUP — เพิ่มเครดิตโดยตรง (ไม่ผ่าน payment flow)
// ═══════════════════════════════════════════════════════════════════

/* ---- ADD CREDITS ---- */
async function applyTopup(amount) {
  // เพิ่มเครดิตให้ผู้ใช้โดยตรง (ใช้ใน freeCredit และ admin ให้เครดิต)
  // amount = จำนวนเครดิตที่จะเพิ่ม

  if (!currentUser) { toast('กรุณาเข้าสู่ระบบก่อน', 'warning'); return; }
  // ตรวจ login

  credits = await API.addCredits(amount);
  // เพิ่มเครดิตใน database

  updateCr();
  // อัปเดต UI

  toast(`เติมเครดิตสำเร็จ! +${amount} เครดิต`, 'success');
  // แจ้ง toast

  closeTopup();
  // ปิด topup modal
}
// ═══════════════════════════════════════════════════════════════════
// PAYMENT HISTORY — บันทึกและดึงประวัติการชำระเงิน
// ═══════════════════════════════════════════════════════════════════

/* ---- PAYMENT HISTORY ---- */
async function recordPayment(pkg, txId = null) {
  if (!currentUser) return;

  const inserts = [
    {
      user_id: currentUser.id,
      amount:  pkg.coins,
      type:    'purchase',
      note:    `ซื้อ ${pkg.coins} เครดิต (฿${pkg.price}) ผ่าน`,
      tx_id:   txId
    }
  ];

  if (pkg.bonus > 0) {
    inserts.push({
      user_id: currentUser.id,
      amount:  pkg.bonus,
      type:    'bonus',
      note:    `โบนัส ${pkg.bonus} เครดิต จากแพ็กเกจ ฿${pkg.price}`,
      tx_id:   txId
    });
  }

  await _sb.from('credit_history').insert(inserts);
}

async function getPaymentHistory() {
  // ดึงประวัติการซื้อเครดิตของผู้ใช้ปัจจุบัน 50 รายการล่าสุด

  if (!currentUser) return [];
  // ถ้าไม่ได้ login ให้ return array ว่าง

  const { data, error } = await _sb
    .from('credit_history')
    .select('*')
    .eq('user_id', currentUser.id)  // WHERE user_id = currentUser.id
    .eq('type', 'purchase')          // AND type = 'purchase' (เฉพาะที่ซื้อ ไม่รวม free/spend)
    .order('created_at', { ascending: false }) // ORDER BY created_at DESC (ล่าสุดก่อน)
    .limit(50); // จำกัด 50 รายการ ป้องกันโหลดข้อมูลมากเกินไป

  if (error) { console.error(error); return []; }
  // ถ้า query error ให้ return array ว่าง (ไม่ crash)

  return data || [];
  // return ข้อมูล หรือ array ว่างถ้า data เป็น null
}

// ═══════════════════════════════════════════════════════════════════
// OVERLAY LOGO ON QR — วาด logo ทับบน QR Code ด้วย Canvas
// ═══════════════════════════════════════════════════════════════════

function _overlayLogoOnQR(qrSrc) {
  // วาด logo "Drink or Doom / ยกหรือยับ" ทับตรงกลาง QR Code
  // ใช้ HTML Canvas API วาดภาพซ้อนกัน
  // qrSrc = data URI ของ QR image base64

  const img = document.querySelector('#qr-pay-modal img');
  // หา img element ใน QR modal

  if (!img) return;
  // ถ้าไม่เจอให้หยุด

  const canvas = document.createElement('canvas');
  // สร้าง canvas element ใหม่

  canvas.width  = 200; // กำหนดความกว้าง 200px (เท่ากับ QR img)
  canvas.height = 200; // กำหนดความสูง 200px

  canvas.style.cssText = img.style.cssText + 'border-radius:8px;';
  // copy style จาก img และเพิ่ม border-radius เพื่อให้ canvas มีหน้าตาเหมือน img เดิม

  const ctx = canvas.getContext('2d');
  // ดึง 2D rendering context สำหรับวาดภาพ

  const qrImg = new Image();
  // สร้าง Image object ใหม่ เพื่อโหลด QR image

  qrImg.onload = () => {
    // callback เมื่อโหลด image สำเร็จ (asynchronous)

    // วาด QR
    ctx.drawImage(qrImg, 0, 0, 200, 200);
    // วาด QR image เต็ม canvas: x=0, y=0, width=200, height=200

    // กล่องพื้นหลัง logo
    const cx = 100, cy = 100; // จุดกึ่งกลาง canvas
    const bw = 90, bh = 36;   // ขนาดกล่อง background: กว้าง 90, สูง 36
    ctx.fillStyle = '#000';    // สีดำ
    ctx.beginPath();           // เริ่ม path ใหม่
    ctx.roundRect(cx - bw/2, cy - bh/2, bw, bh, 6);
    ctx.fill();

    ctx.textAlign    = 'center';   // จัดข้อความกึ่งกลางแนวนอน
    ctx.textBaseline = 'middle';   // จัดข้อความกึ่งกลางแนวตั้ง
    ctx.font         = 'bold 11px Arial'; // font ขนาด 11px bold
    ctx.fillStyle    = '#fff';     // สีขาว
    ctx.fillText('Drink or Doom', cx, cy - 8);

    ctx.font      = 'bold 12px Arial'; // font ขนาดใหญ่ขึ้นนิดหน่อย
    ctx.fillStyle = '#cc0000';         // สีแดงเข้ม
    ctx.fillText('ยกหรือยับ', cx, cy + 9);

    img.replaceWith(canvas);
  };

  qrImg.src = qrSrc;
}
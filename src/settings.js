// =============================================================
//  settings.js — Sağ üstteki dişli menüsü ve "ayarlanıyor" perdesi
//    Grafik: Otomatik · Pil dostu · Yüksek · Ultra (yalnızca masaüstü)
//    Kare hızı: 60 / 120 (üst sınır; Pil dostu her zaman 60)
//  Seçimler localStorage'da saklanır. Menü açıkken arkadaki şeffaf perde
//  dokunuşları yakalar; menüyü kapatmak için ekrana dokunmak robotu zıplatmaz.
// =============================================================
import { CONFIG } from './config.js';

const Q = CONFIG.quality;
const ALL_OPTIONS = [
  { mode: 'oto', label: 'Otomatik', hint: 'Çözünürlük cihaza göre ayarlanır' },
  { mode: 'pil', label: 'Pil dostu', hint: '60 FPS, 1.0×, seyrek çim' },
  { mode: 'yuksek', label: 'Yüksek', hint: 'En keskin görüntü' },
  { mode: 'ultra', label: 'Ultra', hint: 'Gerçek gölgeler (yalnızca bilgisayarda)' },
];
const OLD_MODES = { dusuk: 'pil', orta: 'oto' };  // eski menüden kalan seçimler
const RATES = [60, 120];

const GEAR_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
  <path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.4 7.4 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5c.1.2.4.3.6.2l2.5-1c.5.4 1.1.7 1.7 1l.4 2.6c0 .2.3.4.5.4h4c.2 0 .5-.2.5-.4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1c.2.1.5 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6L19.4 13ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/>
</svg>`;

function load(key) {
  try { return localStorage.getItem(key); } catch (err) { return null; }
}

function store(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (err) { /* önemsiz */ }
}

export class Settings {
  // locked: teşhis parametreleri varken seçim devre dışı (URL ayarları geçerli)
  // allowUltra: gerçek gölgeli "Ultra" seçeneği gösterilsin mi (yalnızca masaüstü)
  constructor({ locked = false, allowUltra = false } = {}) {
    this.locked = locked;
    this.options = ALL_OPTIONS.filter((o) => allowUltra || o.mode !== 'ultra');
    const saved = load(Q.storageKey);
    const mode = OLD_MODES[saved] || saved;
    this.mode = this.options.some((o) => o.mode === mode) ? mode : 'oto';
    this.rate = load(Q.rateKey) === '60' ? 60 : 120;
    this.onChange = null;      // (mode) => …
    this.onRateChange = null;  // (rate) => …

    // Eski kademe sisteminin kayıtları artık kullanılmıyor
    try { for (const k of Q.oldKeys) localStorage.removeItem(k); } catch (err) { /* önemsiz */ }

    this.btn = document.createElement('button');
    this.btn.id = 'settings-btn';
    this.btn.type = 'button';
    this.btn.setAttribute('aria-label', 'Kalite ayarları');
    this.btn.setAttribute('aria-haspopup', 'true');
    this.btn.setAttribute('aria-expanded', 'false');
    this.btn.innerHTML = GEAR_SVG;

    this.backdrop = document.createElement('div');
    this.backdrop.id = 'settings-backdrop';
    this.backdrop.hidden = true;

    this.menu = document.createElement('div');
    this.menu.id = 'settings-menu';
    this.menu.hidden = true;

    const group = document.createElement('div');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Grafik kalitesi');
    group.appendChild(this.title(locked ? 'Kalite (teşhis modu: URL ayarları geçerli)' : 'Grafik kalitesi'));
    this.items = this.options.map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sm-item';
      b.setAttribute('role', 'radio');
      b.dataset.mode = o.mode;
      b.disabled = locked;
      b.innerHTML = `<span class="sm-dot"></span><span class="sm-label">${o.label}<small>${o.hint}</small></span>`;
      b.addEventListener('click', () => this.select(o.mode));
      group.appendChild(b);
      return b;
    });

    const rateGroup = document.createElement('div');
    rateGroup.setAttribute('role', 'radiogroup');
    rateGroup.setAttribute('aria-label', 'Kare hızı');
    rateGroup.appendChild(this.title('Kare hızı (üst sınır)'));
    const seg = document.createElement('div');
    seg.className = 'sm-seg';
    this.rateItems = RATES.map((r) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sm-seg-item';
      b.setAttribute('role', 'radio');
      b.dataset.rate = String(r);
      b.textContent = `${r} FPS`;
      b.addEventListener('click', () => this.selectRate(r));
      seg.appendChild(b);
      return b;
    });
    rateGroup.appendChild(seg);
    this.rateHint = document.createElement('div');
    this.rateHint.className = 'sm-hint';
    rateGroup.appendChild(this.rateHint);

    this.menu.append(group, rateGroup);

    // Bu öğelerdeki dokunuşlar oyuna (tuvale) gitmesin
    for (const el of [this.btn, this.menu, this.backdrop]) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    this.btn.addEventListener('click', () => this.toggle());
    this.backdrop.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.menu.hidden) this.close();
    });

    document.body.append(this.backdrop, this.menu, this.btn);
    this.render();
  }

  title(text) {
    const t = document.createElement('div');
    t.className = 'sm-title';
    t.textContent = text;
    return t;
  }

  select(mode) {
    if (this.locked) return;
    const changed = mode !== this.mode;
    this.mode = mode;
    store(Q.storageKey, mode);
    this.render();
    this.close();
    if (changed && this.onChange) this.onChange(mode);
  }

  selectRate(rate) {
    if (this.locked || this.mode === 'pil' || rate === this.rate) return;
    this.rate = rate;
    store(Q.rateKey, rate);
    this.render();
    if (this.onRateChange) this.onRateChange(rate);
  }

  render() {
    for (const b of this.items) {
      const on = b.dataset.mode === this.mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    const fixed = this.mode === 'pil';  // Pil dostu her zaman 60
    const shown = fixed ? 60 : this.rate;
    for (const b of this.rateItems) {
      const on = Number(b.dataset.rate) === shown;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      b.disabled = this.locked || fixed;
    }
    this.rateHint.textContent = fixed
      ? 'Pil dostu kipte 60 FPS'
      : this.mode === 'oto' && this.rate === 120
        ? '60 ile başlar; pay varsa 120 denenir (120 Hz ekranda)'
        : this.rate === 120 ? 'Ekran destekliyorsa 120 FPS' : 'En çok 60 FPS';
  }

  toggle() {
    if (this.menu.hidden) this.open(); else this.close();
  }

  open() {
    this.menu.hidden = false;
    this.backdrop.hidden = false;
    this.btn.setAttribute('aria-expanded', 'true');
  }

  close() {
    this.menu.hidden = true;
    this.backdrop.hidden = true;
    this.btn.setAttribute('aria-expanded', 'false');
    // Odak düğmede kalırsa Boşluk tuşu menüyü yeniden açar; oyuna geri ver
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }
}

// "Ayarlanıyor" perdesi: çim ya da gölge menüden değişirken kısa süre görünür.
// show() perde ekrana boyandıktan sonra çözülür (ağır iş perdenin arkasında yapılır).
export class Curtain {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'tuning';
    this.el.innerHTML = '<div class="ld-spark"></div><div class="ld-text">Ayarlanıyor…</div>';
    this.el.setAttribute('role', 'status');
    document.body.appendChild(this.el);
  }

  show() {
    this.el.classList.add('on');
    // Geçişin bitmesini (perde tamamen kapansın) ve bir boyamayı bekle
    return new Promise((resolve) => {
      setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 160);
    });
  }

  hide() {
    this.el.classList.remove('on');
  }
}

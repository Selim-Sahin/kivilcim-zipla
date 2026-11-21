// =============================================================
//  settings.js — Sağ üstteki dişli: kalite seçimi
//    Otomatik / Yüksek / Orta / Düşük. Seçim localStorage'da saklanır.
//  Menü açıkken arkadaki şeffaf perde dokunuşları yakalar; menüyü
//  kapatmak için ekrana dokunmak robotu zıplatmaz.
// =============================================================
import { CONFIG } from './config.js';

const KEY = CONFIG.quality.storageKey;
const ALL_OPTIONS = [
  { mode: 'oto', label: 'Otomatik', hint: 'Cihaza göre ayarlanır' },
  { mode: 'ultra', label: 'Ultra', hint: 'Gerçek gölgeler (yalnızca bilgisayarda)' },
  { mode: 'yuksek', label: 'Yüksek', hint: 'Keskin görüntü' },
  { mode: 'orta', label: 'Orta', hint: 'Normal çözünürlük' },
  { mode: 'dusuk', label: 'Düşük', hint: 'Normal çözünürlük, seyrek çim' },
];

const GEAR_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
  <path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.4 7.4 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5c.1.2.4.3.6.2l2.5-1c.5.4 1.1.7 1.7 1l.4 2.6c0 .2.3.4.5.4h4c.2 0 .5-.2.5-.4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1c.2.1.5 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6L19.4 13ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/>
</svg>`;

export class Settings {
  // locked: teşhis parametreleri varken seçim devre dışı (URL ayarları geçerli)
  // allowUltra: gerçek gölgeli "Ultra" seçeneği gösterilsin mi (yalnızca masaüstü)
  constructor({ locked = false, allowUltra = false } = {}) {
    this.locked = locked;
    this.options = ALL_OPTIONS.filter((o) => allowUltra || o.mode !== 'ultra');
    this.mode = this.load();
    this.onChange = null;

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
    this.menu.setAttribute('role', 'radiogroup');
    this.menu.setAttribute('aria-label', 'Grafik kalitesi');
    this.menu.hidden = true;
    const title = document.createElement('div');
    title.className = 'sm-title';
    title.textContent = locked ? 'Kalite (teşhis modu: URL ayarları geçerli)' : 'Grafik kalitesi';
    this.menu.appendChild(title);

    this.items = this.options.map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sm-item';
      b.setAttribute('role', 'radio');
      b.dataset.mode = o.mode;
      b.disabled = locked;
      b.innerHTML = `<span class="sm-dot"></span><span class="sm-label">${o.label}<small>${o.hint}</small></span>`;
      b.addEventListener('click', () => this.select(o.mode));
      this.menu.appendChild(b);
      return b;
    });

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

  load() {
    try {
      const v = localStorage.getItem(KEY);
      return this.options.some((o) => o.mode === v) ? v : 'oto';
    } catch (err) {
      return 'oto';
    }
  }

  save() {
    try { localStorage.setItem(KEY, this.mode); } catch (err) { /* önemsiz */ }
  }

  select(mode) {
    if (this.locked) return;
    const changed = mode !== this.mode;
    this.mode = mode;
    this.save();
    this.render();
    this.close();
    if (changed && this.onChange) this.onChange(mode);
  }

  render() {
    for (const b of this.items) {
      const on = b.dataset.mode === this.mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
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

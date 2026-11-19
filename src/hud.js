// =============================================================
//  hud.js — Ekran üstü arayüz: puan, en iyi skor, puan balonları,
//  ipucu ve "oyun bitti" ekranı. En iyi skor localStorage'da saklanır.
// =============================================================
import { CONFIG } from './config.js';

const KEY = CONFIG.score.storageKey;

export class Hud {
  constructor() {
    this.scoreEl = document.getElementById('score');
    this.bestEl = document.getElementById('best');
    this.hintEl = document.getElementById('hint');
    this.overEl = document.getElementById('gameover');
    this.overScoreEl = document.getElementById('go-score');
    this.overBestEl = document.getElementById('go-best');
    this.overNewEl = document.getElementById('go-new');
    this.popupsEl = document.getElementById('popups');

    this.best = this.loadBest();
    this.renderBest();
  }

  // localStorage gizli sekmede ya da kapalıyken hata fırlatabilir → try/catch
  loadBest() {
    try {
      const v = parseInt(localStorage.getItem(KEY), 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (err) {
      return 0;
    }
  }

  saveBest() {
    try {
      localStorage.setItem(KEY, String(this.best));
    } catch (err) {
      /* kaydedilemezse oyun yine de çalışır */
    }
  }

  renderBest() {
    this.bestEl.textContent = 'En iyi: ' + this.best;
  }

  setScore(n) {
    this.scoreEl.textContent = String(n);
    if (n > 0) {
      // Animasyonu yeniden başlatmak için sınıfı kaldır, yerleşimi zorla, geri ekle
      this.scoreEl.classList.remove('bump');
      void this.scoreEl.offsetWidth;
      this.scoreEl.classList.add('bump');
    }
  }

  // Skoru en iyiyle karşılaştırır; yeni rekorsa kaydeder ve true döner
  commitScore(score) {
    if (score <= this.best) return false;
    this.best = score;
    this.saveBest();
    this.renderBest();
    return true;
  }

  showGameOver(score, isNewBest) {
    this.overScoreEl.textContent = String(score);
    this.overBestEl.textContent = 'En iyi: ' + this.best;
    this.overNewEl.hidden = !isNewBest;
    this.overEl.classList.add('visible');
  }

  hideGameOver() {
    this.overEl.classList.remove('visible');
  }

  hideHint() {
    this.hintEl.classList.add('gone');
  }

  // Ekranın (x, y) piksel noktasında yükselip kaybolan "+N" yazısı
  popup(text, x, y, strong) {
    const el = document.createElement('div');
    el.className = strong ? 'popup strong' : 'popup';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.addEventListener('animationend', () => el.remove());
    this.popupsEl.appendChild(el);
  }
}

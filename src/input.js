// =============================================================
//  input.js — Fare, dokunmatik ve klavyeyi tek tip olaylara çevirir:
//    onPress   → basıldı
//    onRelease → bırakıldı
//    onCancel  → basış yarıda kaldı (sekme değişti, pencere odağı gitti…)
//  Her olaya gerçekleştiği an (ms, performance.now() ölçeğinde) verilir; oyun
//  basılı tutma süresini kare hızından bağımsız, bu zamanlarla hesaplar.
//  Aynı anda yalnızca tek bir basış kaynağı (bir parmak / fare / Boşluk) izlenir.
// =============================================================

// Olayın zaman damgası; tarayıcı tuhaf bir değer verirse şimdiki an
function stamp(e) {
  const now = performance.now();
  const t = e && e.timeStamp;
  return t > 0 && Math.abs(t - now) < 5000 ? t : now;
}

export class Input {
  constructor(element, handlers) {
    this.el = element;
    this.h = handlers;
    this.source = null;     // null | 'pointer' | 'key'
    this.pointerId = null;  // izlenen parmağın/farenin kimliği

    // Not: "(e) => this.f(e)" bir ok fonksiyonudur; içindeki "this"
    // bu sınıfın örneğini göstermeye devam eder (C'deki bağlam işaretçisi gibi).
    element.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    element.addEventListener('pointerup', (e) => this.onPointerUp(e));
    element.addEventListener('pointercancel', () => this.cancel());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => this.cancel());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancel();
    });

    // Uzun basmada tarayıcının kendi davranışlarını kapat:
    // sağ tık menüsü, metin seçimi, çift dokunma yakınlaştırması, kaydırma.
    const block = (e) => e.preventDefault();
    window.addEventListener('contextmenu', block);
    document.addEventListener('selectstart', block);
    document.addEventListener('dblclick', block);
    document.addEventListener('gesturestart', block);                      // iOS kıstırma
    document.addEventListener('touchmove', block, { passive: false });     // iOS sekme kaydırması
    element.addEventListener('touchstart', block, { passive: false });     // iOS büyüteç / çift dokunma
  }

  onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return; // yalnızca sol tık
    e.preventDefault();
    if (this.source !== null) return;                        // zaten basılı
    this.source = 'pointer';
    this.pointerId = e.pointerId;
    // Parmak tuvalin dışına kaysa bile "bırakma" olayı bize gelsin
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* önemsiz */ }
    this.h.onPress(stamp(e));
  }

  onPointerUp(e) {
    if (this.source !== 'pointer' || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this.source = null;
    this.pointerId = null;
    this.h.onRelease(stamp(e));
  }

  onKeyDown(e) {
    if (e.code !== 'Space') return;
    e.preventDefault();                                      // sayfa kaymasın
    if (e.repeat || this.source !== null) return;            // basılı tutunca tekrar gelen olayları yok say
    this.source = 'key';
    this.h.onPress(stamp(e));
  }

  onKeyUp(e) {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (this.source !== 'key') return;
    this.source = null;
    this.h.onRelease(stamp(e));
  }

  cancel() {
    if (this.source === null) return;
    this.source = null;
    this.pointerId = null;
    this.h.onCancel(performance.now());
  }
}

// fake-dom.test-helfer.ts — winziges Ersatz-DOM für Widget-Tests unter node:test.
//
// Die Widgets sind Vanilla-JS und greifen auf document/window zu. Für Tests, die
// nur Ablauf und Zustand prüfen (wer spielt, was wartet), reicht eine Attrappe:
// Elemente merken sich Klassen, Kinder, Attribute und Ereignis-Hörer; eine
// Leinwand liefert einen 2D-Kontext, der jeden Aufruf schluckt.

/* eslint-disable @typescript-eslint/no-explicit-any */

class FakeClassList {
  private s = new Set<string>();
  constructor(private el: FakeElement) {}
  add(...c: string[]) { for (const x of c) this.s.add(x); this.el.syncClass(); }
  remove(...c: string[]) { for (const x of c) this.s.delete(x); this.el.syncClass(); }
  contains(c: string) { return this.s.has(c); }
  toggle(c: string, an?: boolean) { const soll = an ?? !this.s.has(c); if (soll) this.s.add(c); else this.s.delete(c); this.el.syncClass(); return soll; }
  setze(text: string) { this.s = new Set(text.split(/\s+/).filter(Boolean)); }
  text() { return [...this.s].join(' '); }
}

/** Zeichenkontext, der jeden Aufruf annimmt und nichts tut. */
export function stummerKontext(): any {
  const ziel: Record<string, unknown> = {};
  return new Proxy(ziel, {
    get(t, k) {
      if (k in t) return t[k as string];
      if (k === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' || k === 'createConicGradient') return () => ({ addColorStop() {} });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set(t, k, v) { t[k as string] = v; return true; },
  });
}

export class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  attrs: Record<string, string> = {};
  hoerer: Record<string, ((...a: unknown[]) => void)[]> = {};
  style: any;
  classList: FakeClassList;
  private _className = '';
  private _innerHTML = '';
  textContent = '';
  // Medien-Attrappe
  src = '';
  muted = false;
  loop = false;
  playsInline = false;
  preload = '';
  currentTime = 0;
  duration = NaN;
  gespielt = 0;
  width = 300;
  height = 150;
  id = '';
  rect = { width: 1080, height: 1920 };
  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
    this.classList = new FakeClassList(this);
    const props: Record<string, string> = {};
    this.style = { setProperty: (k: string, v: string) => { props[k] = v; }, getPropertyValue: (k: string) => props[k] ?? '' };
  }
  get className() { return this._className; }
  set className(v: string) { this._className = v; this.classList.setze(v); }
  syncClass() { this._className = this.classList.text(); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v: string) {
    this._innerHTML = v;
    this.children = [];
    // Nur die Kinder-Klassen grob nachbilden, damit querySelector('.x') etwas findet.
    for (const m of v.matchAll(/<(\w+)[^>]*class="([^"]+)"/g)) {
      const k = new FakeElement(m[1] as string);
      k.className = m[2] as string;
      this.appendChild(k);
    }
  }
  appendChild(k: FakeElement) { k.parent = this; this.children.push(k); return k; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  querySelector(sel: string): FakeElement | null {
    const klasse = sel.startsWith('.') ? sel.slice(1) : null;
    for (const c of this.children) {
      if (klasse ? c.classList.contains(klasse) : c.tagName === sel.toUpperCase()) return c;
      const tief = c.querySelector(sel);
      if (tief) return tief;
    }
    return null;
  }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  removeAttribute(k: string) { delete this.attrs[k]; if (k === 'src') this.src = ''; }
  addEventListener(n: string, f: (...a: unknown[]) => void) { (this.hoerer[n] ||= []).push(f); }
  removeEventListener(n: string, f: (...a: unknown[]) => void) { this.hoerer[n] = (this.hoerer[n] || []).filter((x) => x !== f); }
  feuere(n: string) { for (const f of this.hoerer[n] || []) f(); }
  getBoundingClientRect() { return { width: this.rect.width, height: this.rect.height, left: 0, top: 0 }; }
  getContext() { return stummerKontext(); }
  play() { this.gespielt++; return Promise.resolve(); }
  pause() {}
  load() {}
}

/** Installiert document/window/localStorage als Attrappe. Gibt das Wurzel-Element zurück. */
export function installiereFakeDom(): FakeElement {
  const head = new FakeElement('head');
  const ids = new Map<string, FakeElement>();
  const orig = head.appendChild.bind(head);
  head.appendChild = (k: FakeElement) => { if (k.id) ids.set(k.id, k); return orig(k); };
  const g = globalThis as any;
  g.document = {
    head,
    createElement: (t: string) => new FakeElement(t),
    getElementById: (id: string) => ids.get(id) ?? null,
  };
  const speicher = new Map<string, string>();
  g.window = g.window || {};
  g.window.localStorage = { getItem: (k: string) => speicher.get(k) ?? null, setItem: (k: string, v: string) => { speicher.set(k, v); } };
  return new FakeElement('div');
}

// ブラウザなしの動作確認：index.html から PV の台本・文字演出・エンドカード・音楽を切り出し、
// ダミーの描画先/音声環境で全カット・全時間帯・全部の音を動かして例外が出ないかを見る
// 使い方: node tools/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const slice = (from, to) => {
  const a = html.indexOf(from);
  const b = html.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`slice not found: ${from}`);
  return html.slice(a, b);
};
const visual = slice('// PVの台本', 'function buildTitleCache(');
const endcard = slice('// 最後のカード：表紙', 'function drawPVOverlay(');
const musicSrc = slice('// ===== PVの音楽', 'async function setupPV() {')
  .replace(/^let audioCtx = null;\n/m, '')
  .replace(/^let noiseBuf = null;\n/m, 'let noiseBuf = {};\n');

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
}
const THREE = { Vector3 };
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (k) => k;

const noop = () => {};
const ctx = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'measureText') return (s) => {
      const m = /([\d.]+)px/.exec(t.font || '40px');
      const w = [...String(s)].length * (m ? parseFloat(m[1]) : 40);
      if (!Number.isFinite(w)) throw new Error('bad width');
      return { width: w };
    };
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    return noop;
  },
  set(t, k, v) {
    if (k === 'globalAlpha' && !Number.isFinite(v)) throw new Error('bad alpha');
    t[k] = v;
    return true;
  },
});

let nodes = 0;
const check = (name, v, t) => {
  if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0) throw new Error(`${name}: ${v} @ ${t}`);
};
const param = (init = 0) => ({
  value: init,
  setValueAtTime(v, t) { check('set', v, t); },
  linearRampToValueAtTime(v, t) { check('lin', v, t); },
  exponentialRampToValueAtTime(v, t) { check('exp', v, t); if (v <= 0) throw new Error(`exp ramp to ${v}`); },
  setTargetAtTime(v, t) { check('target', v, t); },
});
const node = (extra = {}) => { nodes++; return { connect() {}, disconnect() {}, ...extra }; };
const audioCtx = {
  sampleRate: 48000,
  currentTime: 0,
  createGain: () => node({ gain: param(1) }),
  createOscillator: () => node({ type: '', frequency: param(440), detune: param(0), start(t) { check('start', 0, t); }, stop(t) { check('stop', 0, t); } }),
  createBufferSource: () => node({ buffer: null, loop: false, playbackRate: param(1), start(t) { check('start', 0, t); }, stop(t) { check('stop', 0, t); } }),
  createWaveShaper: () => node({ curve: null, oversample: 'none' }),
  createBiquadFilter: () => node({ type: '', frequency: param(350), Q: param(1) }),
  createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
};

const src = `${visual}
pvCover = { width: 1055, height: 1500 }; pvTitleCache = { main: { width: 1200, height: 260 } };
${endcard}
${musicSrc}
return { PV_CARDS, PV_FX, PV_END, drawEndCard, buildMusicEvents };`;
const lib = new Function('THREE', 'clamp01', 'easeInOut', 'easeOutQuad', 'easeOutCubic', 'easeInQuad', 'audioCtx', src)(
  THREE, clamp01, ease, ease, ease, ease, audioCtx);

let frames = 0;
for (const c of lib.PV_CARDS) {
  if (c.title) continue;
  if (c.endcard) {
    for (let lt = 0; lt <= c.dur; lt += 0.05) { lib.drawEndCard(ctx, 1920, 1080, lt, 140); frames++; }
    continue;
  }
  if (!lib.PV_FX[c.fx]) throw new Error(`unknown fx ${c.fx}`);
  const d = c.textDelay ?? 0.08;
  for (let lt = -0.2; lt <= c.dur; lt += 0.02) { lib.PV_FX[c.fx](ctx, 1920, 1080, c, lt - d, c.dur - d, 140); frames++; }
}
const ev = lib.buildMusicEvents();
const m = { bus: node(), send: node() };
for (const e of ev) e.fn(m, e.t + 0.08);
console.log(`ok: ${lib.PV_CARDS.length} cards, ${frames} frames, ${ev.length} sound events, PV_END=${lib.PV_END.toFixed(1)}s`);

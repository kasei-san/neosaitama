// PVを1コマずつ描いてmp4に書き出す（Chromeでコマを受け取り、ffmpegでH.264/AACにまとめる）
// 使い方: node tools/render.mjs <出力パス> [秒数(0=全編)] [fps] [幅] [高さ] [crf] [音声ビットレート]
//   例（スマホ向け）: node tools/render.mjs media/neo-saitama-pv.mp4 0 30 1280 720 24 128k
//   THUMB=0 を付けると1コマ目をサムネイルにしない
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { openRenderPage, dataUrlToBuffer } from './lib.mjs';

const out = process.argv[2];
if (!out) throw new Error('出力パスを指定してください');
const limit = parseFloat(process.argv[3] || '0') > 0 ? parseFloat(process.argv[3]) : null;
const FPS = parseInt(process.argv[4] || '30', 10);
const WIDTH = parseInt(process.argv[5] || '1920', 10);
const HEIGHT = parseInt(process.argv[6] || '1080', 10);
const CRF = process.argv[7] || '17';
const ABR = process.argv[8] || '256k';
const THUMB = process.env.THUMB !== '0';
const HOLD = 1.0; // 最後のカードを止めて見せる余韻（秒）

const { browser, page } = await openRenderPage(WIDTH, HEIGHT);
const duration = limit ?? (await page.evaluate(() => window.pvDuration)) + HOLD;
const frames = Math.ceil(duration * FPS);
console.log(`duration ${duration.toFixed(2)}s, ${frames} frames @ ${FPS}fps, ${WIDTH}x${HEIGHT}`);

// 音：実時間を待たずにOfflineAudioContextで合成したWAVを受け取る（全編で数分かかる）
const wavPath = `${out}.wav`;
const t0 = Date.now();
fs.writeFileSync(wavPath, Buffer.from(await page.evaluate((s) => window.pvRenderAudio(s), duration + 0.5), 'base64'));
console.log(`audio rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-i', wavPath, '-map', '0:v', '-map', '1:a',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', ABR, '-t', String(duration),
  out,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`)))));

// 1コマ目はサムネイル（動画のサムネイルとして使われる）。雨などがなじむよう何コマか空回ししてから描く
if (THUMB) for (let i = 0; i < 20; i++) await page.evaluate((t) => window.pvRenderThumb(t, 'image/jpeg'), 20 + i / FPS);
const t1 = Date.now();
for (let f = 0; f < frames; f++) {
  const url = THUMB && f === 0
    ? await page.evaluate((t) => window.pvRenderThumb(t, 'image/jpeg'), 20 + 20 / FPS)
    : await page.evaluate((t) => window.pvRenderFrame(t), f / FPS);
  if (!ff.stdin.write(dataUrlToBuffer(url))) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 150 === 0 || f === frames - 1) {
    const el = (Date.now() - t1) / 1000;
    console.log(`frame ${f + 1}/${frames}  elapsed ${el.toFixed(0)}s  eta ${((el / (f + 1)) * (frames - f - 1)).toFixed(0)}s`);
  }
}
ff.stdin.end();
await done;
await browser.close();
fs.unlinkSync(wavPath);
console.log(`done: ${path.resolve(out)}`);

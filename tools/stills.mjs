// 各カットの文字が出そろった時点のコマを撮り、一覧画像も作る（見た目の確認用）
// 使い方: node tools/stills.mjs [出力フォルダ]  → card_XX.jpg と contact.jpg
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openRenderPage, dataUrlToBuffer } from './lib.mjs';

const outDir = process.argv[2] || 'stills';
fs.mkdirSync(outDir, { recursive: true });
const { browser, page } = await openRenderPage(1280, 720);
const cards = await page.evaluate(() => window.pvCards);
for (const [i, c] of cards.entries()) {
  const t = c.t0 + c.dur * 0.72;
  for (let k = 8; k >= 1; k--) await page.evaluate((x) => window.pvRenderFrame(x), t - k / 30);
  const url = await page.evaluate((x) => window.pvRenderFrame(x), t);
  fs.writeFileSync(path.join(outDir, `card_${String(i).padStart(2, '0')}.jpg`), dataUrlToBuffer(url));
}
await browser.close();
execFileSync('ffmpeg', ['-v', 'error', '-y', '-pattern_type', 'glob', '-i', path.join(outDir, 'card_*.jpg'),
  '-vf', 'scale=640:-1,tile=4x5:padding=4', '-frames:v', '1', path.join(outDir, 'contact.jpg')]);
console.log(`saved ${cards.length} stills + contact.jpg to ${outDir}`);

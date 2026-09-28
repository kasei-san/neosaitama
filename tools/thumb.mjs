// サムネイル画像（動画の1コマ目と同じ絵）を書き出す: node tools/thumb.mjs [出力png] [幅] [高さ]
import fs from 'node:fs';
import { openRenderPage, dataUrlToBuffer } from './lib.mjs';

const [out = 'media/thumbnail.png', w = '1280', h = '720'] = process.argv.slice(2);
const { browser, page } = await openRenderPage(+w, +h);
for (let i = 0; i < 20; i++) await page.evaluate((t) => window.pvRenderThumb(t), 20 + i / 30);
fs.writeFileSync(out, dataUrlToBuffer(await page.evaluate(() => window.pvRenderThumb(20 + 20 / 30))));
await browser.close();
console.log('saved', out);

// 書き出し用ツールの共通処理：Chrome を開いて PV の書き出しモード（index.html?pv&render）を準備する
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RENDER_URL = `${pathToFileURL(path.join(ROOT, 'index.html')).href}?pv&render`;

// ヘッドレスだとWebGLがソフトウェア描画になり遅いので、画面ありのChromeで描く
export async function openRenderPage(width, height) {
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(RENDER_URL);
  await page.waitForFunction(() => window.pvReady === true, null, { timeout: 120000 });
  return { browser, page };
}

export const dataUrlToBuffer = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

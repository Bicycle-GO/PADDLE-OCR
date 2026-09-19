import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = new URL('../test-results/', import.meta.url);
await mkdir(directory, { recursive: true });
const path = name => new URL(name, directory).pathname.replace(/^\/([A-Za-z]:)/, '$1').replaceAll('%20', ' ');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
const messages = [];
const check = message => { messages.push(message); console.log(`PASS ${message}`); };

try {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '이미지를, 편집 가능한 슬라이드로.' }).waitFor();
  assert.equal(await page.locator('.slide-card').count(), 3);
  check('sample editor renders three slides');
  const source = await page.locator('.slide-background').getAttribute('src');
  await writeFile(new URL('input-slide.png', directory), Buffer.from(source.split(',')[1], 'base64'));
  await page.getByRole('button', { name: '소개 문구 영역 선택', exact: true }).click();
  const editedText = '검증용 텍스트: 이미지에서 편집 가능한 슬라이드로.';
  await page.getByRole('textbox', { name: '인식된 텍스트' }).fill(editedText);
  assert.ok(await page.locator('.canvas-text').filter({ hasText: editedText }).isVisible());
  await page.getByRole('button', { name: '요소 잠금', exact: true }).click();
  assert.ok(await page.getByRole('textbox', { name: '인식된 텍스트' }).isDisabled());
  await page.getByRole('button', { name: '잠금 해제', exact: true }).click();
  await page.getByRole('button', { name: '이 영역 검수 완료', exact: true }).click();
  check('text editing, locking and review work');
  await page.screenshot({ path: path('desktop-editor.png') });

  await page.getByRole('button', { name: 'PPTX 내보내기', exact: true }).click();
  const pptxDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PPTX 다운로드', exact: true }).click();
  await (await pptxDownload).saveAs(path('edited-sample.pptx'));
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check('edited three-slide PPTX downloads');

  const projectDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '프로젝트 저장', exact: true }).click();
  await (await projectDownload).saveAs(path('saved.slideform.json'));
  check('project download completes');

  await page.locator('input[type=file]').first().setInputFiles(path('input-slide.png'));
  await page.locator('.busy-overlay').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.slide-card').count(), 1);
  await page.getByText('아직 분리된 요소가 없어요', { exact: true }).waitFor();
  check('PNG import replaces demo slides and starts without fabricated OCR');
  await page.getByRole('button', { name: '현재 슬라이드 분석', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'PaddleOCR 엔진이 설치되지 않았습니다' }).waitFor();
  check('missing OCR engine returns an actionable error');

  await page.getByRole('button', { name: '이미지 영역', exact: true }).click();
  await page.locator('.slide-canvas').scrollIntoViewIfNeeded();
  const box = await page.locator('.slide-canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.615, box.y + box.height * 0.13);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.945, box.y + box.height * 0.845, { steps: 12 });
  await page.mouse.up();
  await page.getByRole('heading', { name: '이미지 속성', exact: true }).waitFor();
  assert.equal(await page.locator('.canvas-layer.image').count(), 1);
  const startX = Number(await page.getByRole('spinbutton', { name: '영역 X', exact: true }).inputValue());
  await page.getByRole('spinbutton', { name: '영역 X', exact: true }).fill(String(startX - 100));
  assert.equal(Number(await page.getByRole('spinbutton', { name: '영역 X', exact: true }).inputValue()), startX - 100);
  await page.getByRole('button', { name: '실행 취소 (Ctrl+Z)', exact: true }).click();
  await page.getByRole('button', { name: '이미지 영역 영역 선택', exact: true }).click();
  assert.equal(Number(await page.getByRole('spinbutton', { name: '영역 X', exact: true }).inputValue()), startX);
  const imageDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'PNG 다운로드', exact: true }).click();
  await (await imageDownload).saveAs(path('cropped-image.png'));
  check('manual image extraction, coordinate editing, undo and PNG download work');

  await page.locator('input[type=file]').nth(1).setInputFiles(path('saved.slideform.json'));
  await page.locator('.busy-overlay').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.slide-card').count(), 3);
  assert.ok(await page.locator('.canvas-text').filter({ hasText: editedText }).isVisible());
  check('saved project restores edited content');

  const pdfPage = await context.newPage();
  await pdfPage.setContent('<html><head><style>@page{size:1280px 720px;margin:0}body{margin:0}article{width:1280px;height:720px;break-after:page}img{width:100%;height:100%;object-fit:contain}</style></head><body><article><img src="' + source + '"></article><article><img src="' + source + '"></article></body></html>');
  await pdfPage.pdf({ path: path('two-pages.pdf'), preferCSSPageSize: true, printBackground: true });
  await pdfPage.close();
  await page.locator('input[type=file]').first().setInputFiles(path('two-pages.pdf'));
  await page.locator('.busy-overlay').waitFor({ state: 'hidden', timeout: 30000 });
  assert.equal(await page.locator('.slide-card').count(), 2);
  check('PDF splits into two independent slide images');

  await page.getByRole('button', { name: 'PPTX 내보내기', exact: true }).click();
  await page.getByRole('button', { name: '원본 이미지 PPTX 원본 이미지를 그대로 저장 · 편집 내용 미반영', exact: true }).click();
  const originalDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PPTX 다운로드', exact: true }).click();
  await (await originalDownload).saveAs(path('original-two-pages.pptx'));
  check('image-only PPTX export works for imported PDF pages');

  await page.locator('input[type=file]').nth(1).setInputFiles(path('saved.slideform.json'));
  await page.locator('.busy-overlay').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '소개 문구 영역 선택', exact: true }).click();
  await page.getByRole('textbox', { name: '인식된 텍스트' }).fill('새로운 시선이 만드는 더 큰 가능성.\n아이디어의 다음 장을 열어보세요.');
  await page.locator('.editor').evaluate(node => { node.scrollTop = 0; });
  await page.locator('.properties').evaluate(node => { node.scrollTop = 240; });
  await page.screenshot({ path: path('desktop-editor-final.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path('mobile-editor.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check('mobile layout has no horizontal document overflow');
  assert.deepEqual(errors, []);
  check('no uncaught browser errors');
  await writeFile(new URL('browser-results.json', directory), JSON.stringify({ passed: messages, errors }, null, 2));
} finally {
  await context.close();
  await browser.close();
}

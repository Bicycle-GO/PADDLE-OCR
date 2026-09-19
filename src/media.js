import { makeLayer, uid, constrainBox } from './model.js';

const imageCache = new Map();
export function loadImage(src) {
  if (!imageCache.has(src)) {
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { imageCache.delete(src); reject(new Error('이미지를 불러올 수 없습니다.')); };
      img.src = src;
    });
    imageCache.set(src, promise);
    if (imageCache.size > 100) imageCache.delete(imageCache.keys().next().value);
  }
  return imageCache.get(src);
}

export function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

export async function cropImage(src, box) {
  const image = await loadImage(src);
  const canvas = createCanvas(Math.max(1, Math.round(box.w)), Math.max(1, Math.round(box.h)));
  canvas.getContext('2d').drawImage(image, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export async function sampleColor(src, box) {
  const img = await loadImage(src);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const pixels = [];
  for (let t = 0; t <= 1; t += 0.1) {
    for (const [x, y] of [[box.x + box.w * t, box.y - 3], [box.x + box.w * t, box.y + box.h + 3], [box.x - 3, box.y + box.h * t], [box.x + box.w + 3, box.y + box.h * t]]) {
      pixels.push(ctx.getImageData(Math.max(0, Math.min(img.width - 1, x)), Math.max(0, Math.min(img.height - 1, y)), 1, 1).data);
    }
  }
  const median = channel => [...pixels].map(p => p[channel]).sort((a, b) => a - b)[Math.floor(pixels.length / 2)];
  return `#${[0, 1, 2].map(channel => median(channel).toString(16).padStart(2, '0')).join('')}`;
}

export async function cleanBackground(slide) {
  const canvas = createCanvas(slide.width, slide.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(await loadImage(slide.source), 0, 0, slide.width, slide.height);
  // Every extracted source region is erased once, independent of visibility or destination.
  for (const region of slide.eraseRegions) {
    ctx.fillStyle = region.color;
    ctx.fillRect(region.box.x, region.box.y, region.box.w, region.box.h);
  }
  return canvas.toDataURL('image/png');
}

export async function importFiles(files, onProgress) {
  const slides = [];
  let pdfjs;
  for (const file of files) {
    if (file.size > 30 * 1024 * 1024) throw new Error(`${file.name}: 파일당 30MB까지 불러올 수 있습니다.`);
    onProgress(`${file.name} 불러오는 중`);
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      pdfjs ??= await import('pdfjs-dist');
      const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
      const doc = await task.promise;
      try {
        if (doc.numPages + slides.length > 30) throw new Error('한 번에 최대 30페이지까지 불러올 수 있습니다.');
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
          onProgress(`${file.name} · ${pageNumber} / ${doc.numPages} 페이지`);
          const page = await doc.getPage(pageNumber);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: 1920 / Math.max(base.width, base.height) });
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          slides.push(newSlide(`${file.name.replace(/\.pdf$/i, '')} · ${pageNumber}`, canvas));
          page.cleanup();
        }
      } finally { await doc.destroy(); }
    } else if (/^image\/(png|jpeg|webp)$/.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)) {
      const objectUrl = URL.createObjectURL(file);
      try {
        const img = await loadImage(objectUrl);
        if (img.width * img.height > 40_000_000) throw new Error(`${file.name}: 4천만 픽셀 이하 이미지를 사용해 주세요.`);
        const scale = Math.min(1, 2400 / Math.max(img.width, img.height));
        const canvas = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        slides.push(newSlide(file.name.replace(/\.[^.]+$/, ''), canvas));
      } finally { imageCache.delete(objectUrl); URL.revokeObjectURL(objectUrl); }
    } else throw new Error(`${file.name}: PNG, JPG, WEBP, PDF 파일을 선택해 주세요.`);
    if (slides.length > 30) throw new Error('한 번에 최대 30장까지 불러올 수 있습니다.');
  }
  return slides;
}

function newSlide(name, canvas) {
  return { id: uid(), name, width: canvas.width, height: canvas.height,
    source: canvas.toDataURL('image/png'), layers: [], eraseRegions: [], analyzed: false, demo: false };
}

export async function analyzeSlide(slide, language) {
  const blob = await (await fetch(slide.source)).blob();
  const body = new FormData();
  body.append('file', blob, 'slide.png'); body.append('language', language);
  const response = await fetch('/api/analyze', { method: 'POST', body, signal: AbortSignal.timeout(300_000) });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.detail === 'string' ? error.detail : 'OCR 서버에 연결할 수 없습니다. 서버를 실행하거나 영역을 직접 지정해 주세요.');
  }
  const result = await response.json();
  const layers = []; const eraseRegions = [];
  for (const item of result.layers) {
    const box = constrainBox(item.box, slide.width, slide.height);
    const color = await sampleColor(slide.source, box);
    const layer = makeLayer(item.type, box, { ...item, id: uid(), box, reviewed: false });
    if (item.type === 'image') layer.image = await cropImage(slide.source, box);
    layers.push(layer);
    eraseRegions.push({ id: layer.id, box: { ...box }, color });
  }
  return { ...slide, layers, eraseRegions, analyzed: true };
}

export function makeDemoSlides() {
  const slides = [];
  const titles = ['Ideas,\nreimagined.', 'From vision\nto impact.', 'Make room\nfor what’s next.'];
  const names = ['새로운 아이디어의 시작', '가능성을 현실로', '다음 챕터를 함께'];
  for (let i = 0; i < 3; i++) {
    const c = createCanvas(1440, 810); const ctx = c.getContext('2d');
    ctx.fillStyle = '#f1f3ed'; ctx.fillRect(0, 0, 1440, 810);
    const layers = [
      makeLayer('text', { x: 85, y: 75, w: 600, h: 34 }, { name: '섹션 라벨', text: 'STUDIO NOTES  /  2026', fontSize: 22, color: '#526b5f', reviewed: true, confidence: 0.99 }),
      makeLayer('text', { x: 78, y: 230, w: 750, h: 242 }, { name: '메인 타이틀', text: titles[i], fontSize: 108, color: '#203f34', fontFamily: 'Arial', bold: true, reviewed: true, confidence: 0.98 }),
      makeLayer('text', { x: 85, y: 520, w: 620, h: 78 }, { name: '소개 문구', text: ['새로운 시선이 만드는 더 큰 가능성.\n아이디어의 다음 장을 열어보세요.', '흩어져 있던 아이디어를 연결하고,\n의미 있는 변화로 만들어갑니다.', '좋은 아이디어는 계속 진화합니다.\n우리의 다음 이야기는 지금부터.'][i], fontSize: 29, color: '#65796e', confidence: 0.86 }),
      makeLayer('text', { x: 85, y: 718, w: 420, h: 32 }, { name: '하단 캡션', text: 'A NEW PERSPECTIVE', fontSize: 19, color: '#536c60', confidence: 0.96, reviewed: true }),
    ];
    const chart = createCanvas(475, 580); const p = chart.getContext('2d');
    p.fillStyle = '#dbe5d5'; p.fillRect(0, 0, 475, 580);
    p.fillStyle = '#355848'; p.font = '19px Arial'; p.fillText(['POSSIBILITY INDEX', 'IDEA TO IMPACT', 'THE NEXT CHAPTER'][i], 34, 48);
    p.strokeStyle = '#bdcebb'; p.lineWidth = 1;
    for (let y = 145; y <= 440; y += 74) { p.beginPath(); p.moveTo(35, y); p.lineTo(441, y); p.stroke(); }
    const values = [[0.28, 0.46, 0.7, 0.94], [0.4, 0.55, 0.8, 1], [0.32, 0.6, 0.75, 0.98]][i];
    values.forEach((v, index) => {
      p.fillStyle = ['#a8bba0', '#8ba982', '#5d8766', '#315e43'][index];
      p.beginPath(); p.roundRect(42 + index * 100, 443 - v * 305, 72, v * 305, [36, 36, 0, 0]); p.fill();
      p.fillStyle = '#355848'; p.font = '16px Arial'; p.fillText(`0${index + 1}`, 66 + index * 100, 477);
    });
    p.fillStyle = '#355848'; p.font = '16px Arial'; p.fillText('A little further. A little bolder.', 34, 544);
    const image = chart.toDataURL('image/png');
    layers.push(makeLayer('image', { x: 885, y: 105, w: 475, h: 580 }, { name: '성장 그래프', image, confidence: 0.97, reviewed: true }));
    for (const layer of layers) {
      if (layer.type === 'image') ctx.drawImage(chart, layer.box.x, layer.box.y);
      else drawText(ctx, layer);
    }
    slides.push({ id: uid(), name: names[i], width: 1440, height: 810, source: c.toDataURL('image/png'), layers,
      eraseRegions: layers.map(l => ({ id: l.id, box: { ...l.box }, color: '#f1f3ed' })), analyzed: true, demo: true });
  }
  return slides;
}

export function drawText(ctx, layer) {
  ctx.save(); ctx.beginPath(); ctx.rect(layer.box.x, layer.box.y, layer.box.w, layer.box.h); ctx.clip();
  ctx.fillStyle = layer.color;
  ctx.font = `${layer.bold ? '700' : '400'} ${layer.fontSize}px "${layer.fontFamily}", sans-serif`;
  ctx.textBaseline = 'top'; ctx.textAlign = layer.align;
  const x = layer.box.x + (layer.align === 'center' ? layer.box.w / 2 : layer.align === 'right' ? layer.box.w : 0);
  layer.text.split('\n').forEach((line, i) => ctx.fillText(line, x, layer.box.y + i * layer.fontSize * 1.12));
  ctx.restore();
}

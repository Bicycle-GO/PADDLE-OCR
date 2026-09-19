export const uid = () => crypto.randomUUID();
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function constrainBox(box, width, height) {
  const w = clamp(Number(box.w) || 12, Math.min(12, width), width);
  const h = clamp(Number(box.h) || 12, Math.min(12, height), height);
  return { x: clamp(Number(box.x) || 0, 0, width - w), y: clamp(Number(box.y) || 0, 0, height - h), w, h };
}

export function makeLayer(type, box, extra = {}) {
  return { id: uid(), type, name: type === 'text' ? '새 텍스트' : '이미지 영역', box,
    visible: true, locked: false, reviewed: false, confidence: null,
    text: '', fontSize: 32, fontFamily: 'Malgun Gothic', color: '#183b33',
    bold: false, align: 'left', ...extra };
}

// Keep the same scale on both axes. Mixed-aspect pages are letterboxed, never stretched.
export function slideTransform(width, height, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / width, targetHeight / height);
  return { scale, x: (targetWidth - width * scale) / 2, y: (targetHeight - height * scale) / 2 };
}

export function reviewCount(slides) {
  return slides.reduce((count, slide) => count + slide.layers.filter(l => !l.reviewed).length, 0);
}

export function moveSlide(slides, id, direction) {
  const from = slides.findIndex(s => s.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= slides.length) return slides;
  const next = [...slides];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function safeFilename(name) {
  return (name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'Slideform').slice(0, 100);
}

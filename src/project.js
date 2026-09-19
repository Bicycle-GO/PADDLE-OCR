import { constrainBox, makeLayer, uid } from './model.js';

const isImage = value => typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
const text = (value, limit = 10000) => typeof value === 'string' ? value.slice(0, limit) : '';
const color = value => /^#[a-fA-F0-9]{6}$/.test(value) ? value : '#183b33';

export function validateProject(data) {
  const fail = () => { throw new Error('올바른 Slideform v1 프로젝트 파일이 아닙니다.'); };
  if (data?.version !== 1 || !Array.isArray(data.slides) || data.slides.length < 1 || data.slides.length > 30) fail();
  return { title: text(data.title, 80) || '불러온 프로젝트', slides: data.slides.map(s => {
    if (!Number.isFinite(s.width) || !Number.isFinite(s.height) || s.width < 12 || s.height < 12 || s.width > 10000 || s.height > 10000 || s.width * s.height > 40_000_000 || !isImage(s.source) || !Array.isArray(s.layers) || s.layers.length > 500 || !Array.isArray(s.eraseRegions) || s.eraseRegions.length > 1000) fail();
    return { id: uid(), name: text(s.name, 100), width: s.width, height: s.height, source: s.source, analyzed: Boolean(s.analyzed), demo: Boolean(s.demo),
      eraseRegions: s.eraseRegions.map(r => { if (!r.box) fail(); return { id: uid(), box: constrainBox(r.box, s.width, s.height), color: color(r.color) }; }),
      layers: s.layers.map(l => {
        if (!['text', 'image'].includes(l.type) || !l.box || (l.type === 'image' && !isImage(l.image))) fail();
        return makeLayer(l.type, constrainBox(l.box, s.width, s.height), { name: text(l.name, 100), text: text(l.text), image: l.type === 'image' ? l.image : undefined,
          color: color(l.color), fontSize: Math.max(8, Math.min(400, Number(l.fontSize) || 32)), fontFamily: ['Malgun Gothic', 'Arial', 'Georgia'].includes(l.fontFamily) ? l.fontFamily : 'Malgun Gothic',
          bold: Boolean(l.bold), align: ['left', 'center', 'right'].includes(l.align) ? l.align : 'left', confidence: Number.isFinite(l.confidence) ? Math.max(0, Math.min(1, l.confidence)) : null,
          visible: l.visible !== false, locked: Boolean(l.locked), reviewed: Boolean(l.reviewed) });
      }) };
  }) };
}

import { cleanBackground } from './media.js';
import { slideTransform, safeFilename } from './model.js';

export async function buildPresentation(slides, title, mode = 'editable', aspect = 'original') {
  const { default: pptxgen } = await import('pptxgenjs');
  const pptx = new pptxgen();
  const width = 13.333333;
  const height = aspect === '4:3' ? 10 : aspect === '16:9' ? 7.5 : width * slides[0].height / slides[0].width;
  pptx.defineLayout({ name: 'SOURCE', width, height }); pptx.layout = 'SOURCE';
  pptx.author = 'Slideform'; pptx.subject = '이미지에서 복원한 프레젠테이션'; pptx.title = title;
  pptx.company = 'Slideform Studio'; pptx.lang = 'ko-KR';
  for (const source of slides) {
    const page = pptx.addSlide();
    const t = slideTransform(source.width, source.height, width, height);
    page.background = { color: 'FFFFFF' };
    const position = box => ({ x: t.x + box.x * t.scale, y: t.y + box.y * t.scale, w: box.w * t.scale, h: box.h * t.scale });
    page.addImage({ data: mode === 'original' ? source.source : await cleanBackground(source), ...position({ x: 0, y: 0, w: source.width, h: source.height }), altText: source.name });
    if (mode === 'editable') {
      for (const layer of source.layers.filter(l => l.visible)) {
        if (layer.type === 'text') {
          page.addText(layer.text, { ...position(layer.box), fontSize: layer.fontSize * t.scale * 72,
            fontFace: layer.fontFamily, color: layer.color.replace('#', ''), bold: layer.bold,
            align: layer.align, valign: 'top', margin: 0, breakLine: false, paraSpaceAfter: 0,
            lineSpacingMultiple: 1.0, fit: 'shrink', lang: 'ko-KR', objectName: layer.name });
        } else if (layer.image) page.addImage({ data: layer.image, ...position(layer.box), altText: layer.name, objectName: layer.name });
      }
    }
    page.addNotes(`원본: ${source.name}\n출력 방식: ${mode === 'editable' ? '편집 가능한 요소' : '원본 이미지'}\n${source.demo ? '샘플 데이터: 실제 OCR 측정값이 아닙니다.\n' : ''}검수하지 않은 영역: ${source.layers.filter(l => !l.reviewed).length}개\n텍스트 제거 배경은 주변 단색으로 채워집니다. 복잡한 배경은 별도 복원이 필요합니다.`);
  }
  return pptx;
}

export async function downloadPresentation(slides, title, mode, aspect) {
  const pptx = await buildPresentation(slides, title, mode, aspect);
  await pptx.writeFile({ fileName: `${safeFilename(title)}.pptx`, compression: true });
}

export function downloadData(data, filename) {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

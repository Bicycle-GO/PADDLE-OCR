import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Crop, Download, Eye, EyeOff, FileImage, FilePlus2, FileUp, Grip, Image as ImageIcon, Layers3, LayoutTemplate, LoaderCircle, LockKeyhole, Maximize2, Minus, MousePointer2, PanelRight, Plus, Redo2, ScanLine, Settings2, ShieldCheck, Sparkles, Square, Trash2, Type, Undo2, UnlockKeyhole, Upload, X } from 'lucide-react';
import { makeLayer, constrainBox, reviewCount, moveSlide, safeFilename } from './model.js';
import { makeDemoSlides, importFiles, cropImage, sampleColor, cleanBackground, analyzeSlide, loadImage } from './media.js';
import { downloadPresentation, downloadData } from './export.js';

const IconButton = ({ icon: Icon, label, active, ...props }) => <button className={`icon-button ${active ? 'active' : ''}`} aria-label={label} title={label} {...props}><Icon size={17} /></button>;

function Modal({ open, onClose, title, children, className = '' }) {
  const ref = useRef();
  useEffect(() => { if (open && !ref.current.open) ref.current.showModal(); else if (!open && ref.current.open) ref.current.close(); }, [open]);
  return <dialog ref={ref} className={`modal ${className}`} onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
    <div className="modal-heading"><h2>{title}</h2><IconButton icon={X} label="닫기" onClick={onClose} /></div>{children}
  </dialog>;
}

function SlideCanvas({ slide, selected, select, mode, tool, zoom, updateLayer, addRegion, showBoxes }) {
  const [background, setBackground] = useState(slide.source);
  const [gesture, setGesture] = useState(null);
  const canvasRef = useRef();
  useEffect(() => {
    let alive = true;
    if (mode === 'original') setBackground(slide.source);
    else cleanBackground(slide).then(result => { if (alive) setBackground(result); }).catch(() => { if (alive) setBackground(slide.source); });
    return () => { alive = false; };
  }, [slide.source, slide.eraseRegions, mode]);
  useEffect(() => { setGesture(null); }, [slide.id, tool, mode]);
  const point = e => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(slide.width, (e.clientX - rect.left) / rect.width * slide.width)), y: Math.max(0, Math.min(slide.height, (e.clientY - rect.top) / rect.height * slide.height)) };
  };
  const drawBox = g => ({ x: Math.min(g.start.x, g.current.x), y: Math.min(g.start.y, g.current.y), w: Math.abs(g.current.x - g.start.x), h: Math.abs(g.current.y - g.start.y) });
  const movingBox = (g, layer) => constrainBox(g.resize ? { ...layer.box, w: layer.box.w + g.current.x - g.start.x, h: layer.box.h + g.current.y - g.start.y } : { ...layer.box, x: layer.box.x + g.current.x - g.start.x, y: layer.box.y + g.current.y - g.start.y }, slide.width, slide.height);
  const styles = box => ({ left: `${box.x / slide.width * 100}%`, top: `${box.y / slide.height * 100}%`, width: `${box.w / slide.width * 100}%`, height: `${box.h / slide.height * 100}%` });
  function start(e, layer, resize = false) {
    if (e.button !== 0 || mode === 'original') return;
    e.stopPropagation();
    if (layer) select(layer.id);
    else select(null);
    if (layer?.locked || (!layer && tool === 'select')) return;
    const p = point(e);
    canvasRef.current.setPointerCapture(e.pointerId);
    setGesture({ start: p, current: p, layerId: layer?.id, resize });
  }
  function finish(e) {
    if (!gesture) return;
    const final = { ...gesture, current: point(e) };
    if (final.layerId) {
      const layer = slide.layers.find(l => l.id === final.layerId);
      if (Math.abs(final.start.x - final.current.x) + Math.abs(final.start.y - final.current.y) > 2) updateLayer(layer.id, { box: movingBox(final, layer) });
    } else {
      const box = drawBox(final);
      if (box.w >= 12 && box.h >= 12) addRegion(tool, box);
    }
    setGesture(null);
  }
  return <div className="canvas-scroll"><div className="canvas-stage"><div className={`slide-canvas ${tool !== 'select' && mode === 'edit' ? 'drawing' : ''}`} ref={canvasRef}
    style={{ aspectRatio: `${slide.width}/${slide.height}`, width: `${zoom}%`, maxWidth: `${zoom * 11.2}px` }}
    onPointerDown={e => start(e)} onPointerMove={e => gesture && setGesture({ ...gesture, current: point(e) })} onPointerUp={finish} onPointerCancel={() => setGesture(null)}>
    <img className="slide-background" src={background} alt={`${slide.name} ${mode === 'original' ? '원본' : '편집 배경'}`} draggable="false" />
    {mode === 'edit' && slide.layers.filter(l => l.visible).map(layer => {
      const box = gesture?.layerId === layer.id ? movingBox(gesture, layer) : layer.box;
      return <div key={layer.id} role="button" tabIndex={tool === 'select' ? 0 : -1} aria-label={`${layer.name} 영역 선택`}
        className={`canvas-layer ${layer.type} ${selected === layer.id ? 'selected' : ''} ${showBoxes ? 'outlined' : ''} ${layer.locked ? 'locked' : ''}`}
        style={{ ...styles(box), pointerEvents: tool !== 'select' ? 'none' : undefined }} onPointerDown={e => start(e, layer)} onKeyDown={e => { if (e.key === 'Enter') select(layer.id); }}>
        {layer.type === 'text' ? <div className="canvas-text" style={{ fontSize: `${layer.fontSize / slide.width * 100}cqw`, color: layer.color, fontFamily: `"${layer.fontFamily}", sans-serif`, fontWeight: layer.bold ? 700 : 400, textAlign: layer.align }}>{layer.text}</div> : <img src={layer.image} alt={layer.name} draggable="false" />}
        {selected === layer.id && <><span className="selection-label">{layer.type === 'text' ? 'T' : '▧'} &nbsp; {layer.name}</span>{!layer.locked && <span className="resize-handle" onPointerDown={e => start(e, layer, true)} />}</>}
      </div>;
    })}
    {gesture && !gesture.layerId && <div className="draw-rectangle" style={styles(drawBox(gesture))} />}
  </div></div></div>;
}

function App() {
  const [project, setProject] = useState(() => ({ title: '새로운 아이디어의 시작', slides: makeDemoSlides() }));
  const [slideId, setSlideId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [mode, setMode] = useState('edit');
  const [tool, setTool] = useState('select');
  const [zoom, setZoom] = useState(100);
  const [showBoxes, setShowBoxes] = useState(true);
  const [filter, setFilter] = useState('all');
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const [server, setServer] = useState('checking');
  const [language, setLanguage] = useState('korean');
  const [exportMode, setExportMode] = useState('editable');
  const [aspect, setAspect] = useState('original');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();
  const restoreRef = useRef();
  const projectRef = useRef(project);
  projectRef.current = project;
  const slide = project.slides.find(s => s.id === slideId) ?? project.slides[0];
  const slideIndex = project.slides.findIndex(s => s.id === slide.id);
  const layer = slide.layers.find(l => l.id === selected);
  const pending = reviewCount(project.slides);
  const allLayers = project.slides.flatMap(s => s.layers);
  const announce = (text, kind = 'success') => setToast({ text, kind });
  const commit = next => { setHistory(prev => [...prev.slice(-39), projectRef.current]); setFuture([]); setProject(next); };
  const editSlide = edited => commit({ ...project, slides: project.slides.map(s => s.id === slide.id ? edited : s) });
  const updateLayer = (id, changes) => editSlide({ ...slide, layers: slide.layers.map(l => l.id === id ? { ...l, ...changes } : l) });
  const chooseSlide = id => { setSlideId(id); setSelected(null); setTool('select'); };
  const undo = () => { if (!history.length || busy) return; setFuture([project, ...future]); setProject(history.at(-1)); setHistory(history.slice(0, -1)); setSelected(null); };
  const redo = () => { if (!future.length || busy) return; setHistory([...history, project]); setProject(future[0]); setFuture(future.slice(1)); setSelected(null); };

  async function checkServer() {
    setServer('checking');
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
      const data = await res.json();
      setServer(data.ocr_available ? 'ready' : 'missing');
    } catch { setServer('offline'); }
  }
  useEffect(() => { checkServer(); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 5500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    function keydown(e) {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || dialog || busy) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if (e.key === 'Escape') { setSelected(null); setTool('select'); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && layer && !layer.locked) { e.preventDefault(); deleteLayer(); }
      if (layer && !layer.locked && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault(); const n = e.shiftKey ? 10 : 1;
        updateLayer(layer.id, { box: constrainBox({ ...layer.box, x: layer.box.x + (e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0), y: layer.box.y + (e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0) }, slide.width, slide.height) });
      }
    }
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });
  useEffect(() => {
    if (!history.length) return;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [history.length]);

  async function handleFiles(files) {
    if (!files?.length || busy) return;
    setBusy('파일을 준비하고 있습니다'); setDialog(null);
    try {
      const imported = await importFiles(Array.from(files), setBusy);
      const existing = project.slides.every(s => s.demo) ? [] : project.slides;
      if (imported.length + existing.length > 30) throw new Error('프로젝트에는 최대 30장까지 추가할 수 있습니다.');
      commit({ title: existing.length ? project.title : imported[0].name, slides: [...existing, ...imported] });
      chooseSlide(imported[0].id); setMode('original');
      announce(`${imported.length}장을 불러왔습니다. 자동 분석하거나 영역을 직접 지정해 주세요.`);
    } catch (e) { announce(e.message, 'error'); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function addRegion(type, box) {
    setBusy('영역을 분리하고 있습니다');
    try {
      const color = await sampleColor(slide.source, box);
      const newLayer = makeLayer(type, box, type === 'image' ? { image: await cropImage(slide.source, box) } : { text: '텍스트를 입력하세요', fontSize: Math.max(16, Math.min(48, box.h * 0.6)) });
      editSlide({ ...slide, layers: [...slide.layers, newLayer], eraseRegions: [...slide.eraseRegions, { id: newLayer.id, box: { ...box }, color }] });
      setSelected(newLayer.id); setTool('select');
      announce(type === 'image' ? '이미지를 독립된 요소로 분리했습니다.' : '오른쪽 패널에서 텍스트를 입력해 주세요.');
    } catch (e) { announce(e.message, 'error'); } finally { setBusy(''); }
  }

  async function runAnalysis() {
    if (busy) return;
    if (slide.layers.length) { setDialog('reanalyze'); return; }
    await analyze();
  }
  async function analyze() {
    setDialog(null); setBusy('PaddleOCR 분석 중 · 첫 실행은 모델을 준비하는 데 시간이 걸립니다');
    try {
      const result = await analyzeSlide(slide, language);
      editSlide(result); setSelected(result.layers[0]?.id ?? null); setMode('edit'); setTool('select');
      announce(`${result.layers.length}개 영역을 찾았습니다. 위치와 내용을 검수해 주세요.`);
      setServer('ready');
    } catch (e) { announce(e.name === 'TimeoutError' ? '분석 대기 시간이 초과되었습니다. 모델 준비 상태를 확인해 주세요.' : e.message, 'error'); }
    finally { setBusy(''); }
  }

  function deleteLayer() {
    if (!layer || layer.locked) return;
    editSlide({ ...slide, layers: slide.layers.filter(l => l.id !== layer.id) }); setSelected(null);
  }
  function saveProject() {
    downloadData(JSON.stringify({ version: 1, ...project }), `${safeFilename(project.title)}.slideform.json`);
    announce('프로젝트 파일을 저장했습니다. 다음에 불러와 계속 편집할 수 있습니다.');
  }
  async function restoreProject(file) {
    if (!file) return;
    setBusy('프로젝트를 불러오고 있습니다');
    try {
      const { validateProject } = await import('./project.js');
      if (file.size > 150 * 1024 * 1024) throw new Error('프로젝트 파일은 최대 150MB까지 지원합니다.');
      const restored = validateProject(JSON.parse(await file.text()));
      for (const page of restored.slides) {
        const image = await loadImage(page.source);
        if (image.width !== page.width || image.height !== page.height) throw new Error('프로젝트의 이미지 크기와 좌표 정보가 일치하지 않습니다.');
        for (const item of page.layers) if (item.type === 'image') await loadImage(item.image);
      }
      commit(restored); chooseSlide(restored.slides[0].id); setMode('edit'); setDialog(null);
      announce('프로젝트를 불러왔습니다.');
    } catch (e) { announce(e.message || '프로젝트 파일을 확인해 주세요.', 'error'); }
    finally { setBusy(''); restoreRef.current.value = ''; }
  }
  async function exportPptx() {
    setBusy('PowerPoint 파일을 만들고 있습니다');
    try { await downloadPresentation(project.slides, project.title, exportMode, aspect); setDialog(null); announce('PPTX 파일을 다운로드했습니다.'); }
    catch (e) { announce(`내보내기 실패: ${e.message}`, 'error'); }
    finally { setBusy(''); }
  }

  return <div className="app" onDragOver={e => { e.preventDefault(); if (!busy && e.dataTransfer.types.includes('Files')) setDragOver(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }} onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}>
    <input hidden ref={fileRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={e => handleFiles(e.target.files)} />
    <input hidden ref={restoreRef} type="file" accept=".json" onChange={e => restoreProject(e.target.files[0])} />
    <header className="app-header">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setDialog('about'); }} aria-label="Slideform 안내"><span className="brand-mark"><Layers3 size={22} /></span>slideform<span className="studio-label">STUDIO</span></a>
      <div className="header-divider" />
      <div className="project-title"><input aria-label="프로젝트 이름" value={project.title} onChange={e => commit({ ...project, title: e.target.value })} maxLength={80} disabled={!!busy} /><span className="project-caption">{project.slides.every(s => s.demo) ? '샘플 프로젝트' : '로컬 프로젝트'}<span>·</span>브라우저에서 작업 중</span></div>
      <div className="header-actions"><button className="text-button save-button" onClick={saveProject} disabled={!!busy}><Download size={16} />프로젝트 저장</button><button className="button primary" onClick={() => setDialog('export')} disabled={!!busy}><Download size={17} />PPTX 내보내기<ChevronRight size={15} /></button></div>
    </header>
    <div className="workflow-bar"><div className="workflow-steps"><button onClick={() => setDialog('upload')}><span className="step completed"><Check size={12} /></span>파일 불러오기</button><ChevronRight size={13} /><button className="current" onClick={() => { setMode('edit'); setDialog(null); }}><span className="step">2</span>분리 및 편집</button><ChevronRight size={13} /><button onClick={() => setDialog('export')}><span className="step upcoming">3</span>PPTX 완성</button></div><button className={`server-status ${server === 'ready' ? 'ready' : ''}`} onClick={() => setDialog('settings')}><span />{server === 'ready' ? 'PaddleOCR 연결됨' : server === 'checking' ? 'OCR 서버 확인 중' : 'OCR 서버 미연결'}<Settings2 size={13} /></button></div>
    <main className="workspace" inert={busy ? true : undefined}>
      <aside className="slide-sidebar" aria-label="슬라이드 목록">
        <div className="panel-heading"><h2>슬라이드 <span>{project.slides.length.toString().padStart(2, '0')}</span></h2><IconButton icon={Plus} label="슬라이드 추가" onClick={() => setDialog('upload')} /></div>
        <div className="slide-list">{project.slides.map((s, index) => <button key={s.id} className={`slide-card ${s.id === slide.id ? 'active' : ''}`} onClick={() => chooseSlide(s.id)}>
          <div className="slide-card-top"><span>{String(index + 1).padStart(2, '0')}</span><span className={`slide-state ${s.analyzed ? 'analyzed' : ''}`}>{s.demo ? '샘플' : s.analyzed ? '분석 완료' : '분석 대기'}</span></div>
          <div className="thumbnail"><img src={s.source} alt={`${index + 1}번 슬라이드 미리보기`} /></div>
          <div className="slide-card-title">{s.name}</div><div className="slide-card-info"><Type size={12} />{s.layers.filter(l => l.type === 'text').length}<ImageIcon size={12} />{s.layers.filter(l => l.type === 'image').length}{s.layers.some(l => !l.reviewed) && <span className="review-dot" title="검수할 영역 있음" />}</div>
        </button>)}</div>
        <button className="add-slide" onClick={() => setDialog('upload')}><Plus size={17} />슬라이드 추가</button>
        <div className="sidebar-bottom"><div className="reorder-controls"><span>슬라이드 순서</span><IconButton icon={ArrowUp} label="슬라이드 앞으로" disabled={slideIndex === 0} onClick={() => commit({ ...project, slides: moveSlide(project.slides, slide.id, -1) })} /><IconButton icon={ArrowDown} label="슬라이드 뒤로" disabled={slideIndex === project.slides.length - 1} onClick={() => commit({ ...project, slides: moveSlide(project.slides, slide.id, 1) })} /><IconButton icon={Trash2} label="슬라이드 삭제" disabled={project.slides.length === 1} onClick={() => setDialog('delete-slide')} /></div><button className="help-link" onClick={() => setDialog('about')}><CircleHelp size={15} />작업 가이드<ArrowRight size={14} /></button></div>
      </aside>
      <section className="editor" aria-label="슬라이드 편집 작업 공간">
        <div className="editor-top"><div><div className="eyebrow">SLIDE WORKSPACE</div><h1>이미지를, 편집 가능한 슬라이드로.</h1><p>텍스트와 이미지 영역을 확인하고, 원하는 모습으로 다듬어 보세요.</p></div><button className="button secondary analyze-button" onClick={runAnalysis}><ScanLine size={17} />현재 슬라이드 분석</button></div>
        {slide.demo && <div className="demo-banner"><Sparkles size={15} /><span>샘플로 먼저 둘러보세요. <strong>영역을 클릭하면 바로 편집할 수 있어요.</strong></span><button onClick={() => setDialog('upload')}>내 파일 불러오기<ArrowRight size={14} /></button></div>}
        <div className="canvas-card">
          <div className="canvas-toolbar"><div className="segmented view-switch"><button className={mode === 'original' ? 'selected' : ''} onClick={() => { setMode('original'); setTool('select'); }}><FileImage size={15} />원본</button><button className={mode === 'edit' ? 'selected' : ''} onClick={() => setMode('edit')}><Layers3 size={15} />분리 결과</button></div><div className="toolbar-right"><span className="canvas-ratio">{slide.width} × {slide.height}</span><IconButton icon={Undo2} label="실행 취소 (Ctrl+Z)" disabled={!history.length} onClick={undo} /><IconButton icon={Redo2} label="다시 실행 (Ctrl+Shift+Z)" disabled={!future.length} onClick={redo} /><span className="tool-separator" /><IconButton icon={Square} label="영역 테두리 표시" active={showBoxes} onClick={() => setShowBoxes(!showBoxes)} /></div></div>
          <div className="canvas-area"><div className="canvas-label"><span>{String(slideIndex + 1).padStart(2, '0')} / {String(project.slides.length).padStart(2, '0')}</span><span>{mode === 'original' ? '원본 이미지' : '편집 가능한 레이어'}</span></div>
            <SlideCanvas slide={slide} selected={selected} select={setSelected} mode={mode} tool={tool} zoom={zoom} updateLayer={updateLayer} addRegion={addRegion} showBoxes={showBoxes} />
            <div className="canvas-bottom"><div className="legend"><span><i className="text-legend" />텍스트</span><span><i className="image-legend" />이미지</span></div><div className="zoom-controls"><IconButton icon={Minus} label="축소" disabled={zoom <= 50} onClick={() => setZoom(Math.max(50, zoom - 10))} /><button className="zoom-label" onClick={() => setZoom(100)}>{zoom}%</button><IconButton icon={Plus} label="확대" disabled={zoom >= 160} onClick={() => setZoom(Math.min(160, zoom + 10))} /><IconButton icon={Maximize2} label="화면에 맞추기" onClick={() => setZoom(100)} /></div></div>
          </div>
          <div className="editing-tools"><div className="tool-group"><button className={tool === 'select' ? 'chosen' : ''} onClick={() => { setTool('select'); setMode('edit'); }}><MousePointer2 size={16} />선택</button><span /><button className={tool === 'text' ? 'chosen' : ''} onClick={() => { setTool('text'); setMode('edit'); }}><Type size={17} />텍스트 영역</button><button className={tool === 'image' ? 'chosen' : ''} onClick={() => { setTool('image'); setMode('edit'); }}><Crop size={17} />이미지 영역</button></div><span className="tool-hint">{tool === 'select' ? '영역을 드래그해 위치를 조정하세요' : '캔버스에서 드래그해 영역을 지정하세요'}</span></div>
        </div>
        <div className="review-strip"><span className="review-icon"><ShieldCheck size={20} /></span><div><strong>{slide.layers.filter(l => !l.reviewed).length ? `${slide.layers.filter(l => !l.reviewed).length}개 영역을 한 번 더 확인해 주세요` : slide.layers.length ? '이 슬라이드의 검수가 완료되었어요' : '분리할 영역을 지정해 주세요'}</strong><p>{slide.demo ? '샘플 신뢰도는 화면 설명용입니다. 실제 분석값이 아닙니다.' : '글자, 줄바꿈, 이미지 경계를 확인하면 완성도가 높아집니다.'}</p></div><button className="text-button" onClick={() => { const next = slide.layers.find(l => !l.reviewed); if (next) { setSelected(next.id); setMode('edit'); setFilter('all'); } else announce('현재 슬라이드에 남은 검수 영역이 없습니다.'); }}>영역 검수하기<ArrowRight size={15} /></button></div>
        <footer className="workspace-footer"><span>원본은 보존됩니다. 편집 내용은 프로젝트 파일로 저장하세요.</span><span><LockKeyhole size={12} />로컬 작업 공간</span></footer>
      </section>
      <aside className="properties" aria-label="요소와 속성">
        <div className="panel-heading"><h2>요소 <span>{slide.layers.length}</span></h2><Layers3 size={16} /></div>
        <div className="element-tabs" role="group" aria-label="요소 필터">{[['all', '전체'], ['text', '텍스트'], ['image', '이미지']].map(([key, label]) => <button key={key} aria-pressed={filter === key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}{key === 'all' && <span>{slide.layers.length}</span>}</button>)}</div>
        <div className="layer-list">{slide.layers.filter(l => filter === 'all' || filter === l.type).map(l => <div key={l.id} className={`layer-row ${l.id === selected ? 'selected' : ''} ${!l.visible ? 'muted' : ''}`}><button className="layer-select" onClick={() => { setSelected(l.id); setMode('edit'); setTool('select'); }}><span className={`layer-icon ${l.type}`}>{l.type === 'text' ? <Type size={16} /> : <ImageIcon size={16} />}</span><span><strong>{l.name}</strong><small>{l.type === 'text' ? l.text.replace(/\n/g, ' ') : '독립 이미지 요소'}</small></span>{!l.reviewed && <i className="review-dot" />}</button><IconButton icon={l.visible ? Eye : EyeOff} label={`${l.name} ${l.visible ? '숨기기' : '표시'}`} onClick={() => updateLayer(l.id, { visible: !l.visible })} /></div>)}{!slide.layers.length && <div className="empty-layers"><ScanLine size={25} /><strong>아직 분리된 요소가 없어요</strong><p>자동 분석하거나 아래 도구로<br />영역을 직접 지정해 주세요.</p></div>}</div>
        {layer ? <div className="layer-properties"><div className="section-heading"><h3>{layer.type === 'text' ? '텍스트 속성' : '이미지 속성'}</h3><div><IconButton icon={layer.locked ? LockKeyhole : UnlockKeyhole} label={layer.locked ? '잠금 해제' : '요소 잠금'} active={layer.locked} onClick={() => updateLayer(layer.id, { locked: !layer.locked })} /><IconButton icon={Trash2} label="선택 요소 삭제" disabled={layer.locked} onClick={deleteLayer} /></div></div>
          <fieldset disabled={layer.locked} className="property-fields"><label className="field-label">요소 이름<input value={layer.name} onChange={e => updateLayer(layer.id, { name: e.target.value })} /></label>
            {layer.type === 'text' ? <><label className="field-label">인식된 텍스트<textarea rows={4} value={layer.text} onChange={e => updateLayer(layer.id, { text: e.target.value, reviewed: false })} /></label><label className="field-label">글꼴<select value={layer.fontFamily} onChange={e => updateLayer(layer.id, { fontFamily: e.target.value })}><option value="Malgun Gothic">맑은 고딕</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option></select></label><div className="property-grid"><label className="field-label">크기 (px)<input type="number" min="8" max="400" value={layer.fontSize} onChange={e => updateLayer(layer.id, { fontSize: Math.max(8, Math.min(400, Number(e.target.value) || 8)) })} /></label><label className="field-label">글자 색상<span className="color-field"><input type="color" value={layer.color} onChange={e => updateLayer(layer.id, { color: e.target.value })} /><span>{layer.color.toUpperCase()}</span></span></label></div><div className="text-options"><button className={`bold-button ${layer.bold ? 'selected' : ''}`} aria-pressed={layer.bold} onClick={() => updateLayer(layer.id, { bold: !layer.bold })}>B</button><select aria-label="텍스트 정렬" value={layer.align} onChange={e => updateLayer(layer.id, { align: e.target.value })}><option value="left">왼쪽 정렬</option><option value="center">가운데 정렬</option><option value="right">오른쪽 정렬</option></select></div></> : <div className="image-preview"><img src={layer.image} alt="분리된 이미지" /><a href={layer.image} download={`${safeFilename(layer.name)}.png`}><Download size={14} />PNG 다운로드</a></div>}
            <div className="section-subtitle">위치 및 크기 <span>px</span></div><div className="geometry-grid">{[['x', 'X'], ['y', 'Y'], ['w', 'W'], ['h', 'H']].map(([key, label]) => <label key={key}><span>{label}</span><input aria-label={`영역 ${label}`} type="number" step="1" value={Math.round(layer.box[key])} onChange={e => updateLayer(layer.id, { box: constrainBox({ ...layer.box, [key]: Number(e.target.value) }, slide.width, slide.height) })} /></label>)}</div>
          </fieldset>
          <div className="confidence-row"><span>{slide.demo ? '샘플 신뢰도' : layer.confidence === null ? '수동 지정 영역' : '인식 신뢰도'}</span><strong className={layer.confidence !== null && layer.confidence < 0.9 ? 'amber' : ''}>{layer.confidence === null ? '직접 검수' : `${Math.round(layer.confidence * 100)}%`}</strong></div>
          <button className={`button review-button ${layer.reviewed ? 'reviewed' : ''}`} onClick={() => updateLayer(layer.id, { reviewed: !layer.reviewed })}><CheckCheck size={16} />{layer.reviewed ? '검수 완료' : '이 영역 검수 완료'}</button>
        </div> : <div className="properties-empty"><span><MousePointer2 size={22} /></span><h3>디테일을 다듬는 곳</h3><p>캔버스 또는 목록에서 요소를 선택하면<br />내용과 위치를 세밀하게 조정할 수 있어요.</p><div className="keyboard-tip"><kbd>↑ ↓ ← →</kbd><span>1px씩 이동</span><kbd>Shift + 방향키</kbd><span>10px씩 이동</span></div></div>}
        <div className="properties-note"><ShieldCheck size={16} /><p>텍스트를 지운 자리는 주변 단색으로 채웁니다. 복잡한 배경은 추가 복원이 필요해요.</p></div>
      </aside>
    </main>
    <div className="app-statusbar"><span><span className="status-tiny-dot" />{busy || '편집 준비 완료'}</span><span>{project.slides.length}개 슬라이드<span className="status-divider">/</span>텍스트 {allLayers.filter(l => l.type === 'text').length}개<span className="status-divider">/</span>이미지 {allLayers.filter(l => l.type === 'image').length}개<span className="status-divider">/</span>검수 대기 {pending}개</span><span>SLIDEFORM v0.1</span></div>
    <Modal open={dialog === 'upload'} onClose={() => setDialog(null)} title="슬라이드 불러오기"><p className="modal-description">AI로 만든 슬라이드 이미지를 편집 가능한 프레젠테이션으로 바꿔보세요.</p><button className="upload-zone" onClick={() => fileRef.current.click()}><span><Upload size={29} /></span><strong>파일을 놓거나 클릭하여 선택하세요</strong><p>PNG, JPG, WEBP 또는 PDF</p><small>파일당 30MB · 프로젝트당 최대 30장</small></button><div className="import-note"><FileImage size={19} /><p><strong>이미지 한 장이 슬라이드 한 장으로</strong><br />PDF는 페이지별로 나누어 불러옵니다. 기존 PPTX 입력은 후속 개발 범위입니다.</p></div><button className="button full secondary" onClick={() => restoreRef.current.click()}><FileUp size={17} />저장한 Slideform 프로젝트 열기</button></Modal>
    <Modal open={dialog === 'export'} onClose={() => !busy && setDialog(null)} title="프레젠테이션 내보내기"><p className="modal-description">{project.slides.length}개 슬라이드를 PowerPoint에서 이어서 작업하세요.</p><div className="export-options"><button className={exportMode === 'editable' ? 'selected' : ''} onClick={() => setExportMode('editable')}><Layers3 size={22} /><span><strong>편집 가능한 PPTX</strong><small>텍스트 상자와 이미지 요소로 각각 분리</small></span><i>{exportMode === 'editable' && <Check size={12} />}</i></button><button className={exportMode === 'original' ? 'selected' : ''} onClick={() => setExportMode('original')}><FileImage size={22} /><span><strong>원본 이미지 PPTX</strong><small>원본 이미지를 그대로 저장 · 편집 내용 미반영</small></span><i>{exportMode === 'original' && <Check size={12} />}</i></button></div><label className="field-label export-ratio">슬라이드 비율<select value={aspect} onChange={e => setAspect(e.target.value)}><option value="original">첫 슬라이드의 원본 비율</option><option value="16:9">와이드스크린 (16:9)</option><option value="4:3">표준 (4:3)</option></select></label>{exportMode === 'editable' && <div className="export-notice"><ShieldCheck size={18} /><p>{pending > 0 ? `검수 전 영역이 ${pending}개 있습니다. ` : ''}배경은 주변 단색으로 채우며, 글꼴은 PowerPoint 환경에 따라 달라질 수 있습니다.{project.slides.some(s => !s.layers.length) && ' 미분석 슬라이드는 원본 이미지로 포함됩니다.'}</p></div>}<button className="button primary full" disabled={!!busy} onClick={exportPptx}>{busy ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />}{busy ? '파일 만드는 중…' : 'PPTX 다운로드'}</button></Modal>
    <Modal open={dialog === 'settings'} onClose={() => setDialog(null)} title="분석 설정"><p className="modal-description">PaddleOCR 서버를 연결하면 텍스트와 이미지 영역을 자동으로 찾습니다.</p><label className="field-label">인식 언어<select value={language} onChange={e => setLanguage(e.target.value)}><option value="korean">한국어 + 영어</option><option value="en">영어</option><option value="japan">일본어</option></select></label><div className="server-card"><ScanLine size={23} /><div><strong>{server === 'ready' ? 'PaddleOCR 서버 연결됨' : server === 'missing' ? '서버 연결됨 · OCR 패키지 설치 필요' : 'PaddleOCR 서버 미연결'}</strong><p>PP-StructureV3 · 로컬 분석</p></div><button className="text-button" onClick={checkServer}>다시 확인</button></div><p className="small-note">서버가 없어도 파일 불러오기, 수동 영역 분리, 편집, PPTX 내보내기는 사용할 수 있습니다. 서버 실행 방법은 프로젝트 README를 확인하세요.</p></Modal>
    <Modal open={dialog === 'about'} onClose={() => setDialog(null)} title="슬라이드에 편집의 자유를"><p className="modal-description">Slideform은 한 장의 이미지로 굳어진 프레젠테이션을 다시 다룰 수 있게 만드는 작업 공간입니다.</p><ol className="guide-list"><li><span>01</span><div><strong>슬라이드를 불러오세요</strong><p>여러 이미지나 PDF를 한 번에 추가합니다.</p></div></li><li><span>02</span><div><strong>분리하고, 세밀하게 다듬으세요</strong><p>OCR로 분석하거나 영역을 직접 그립니다. 텍스트, 좌표, 크기를 수정하고 결과를 검수합니다.</p></div></li><li><span>03</span><div><strong>PowerPoint에서 이어가세요</strong><p>편집 가능한 PPTX를 다운로드합니다. 작업 중에는 프로젝트 파일도 저장해 주세요.</p></div></li></ol><div className="export-notice"><CircleHelp size={18} /><p>이 버전은 기능 초안입니다. 글꼴 자동 식별, 복잡한 배경 인페인팅, 겹친 객체 분리, 표·차트의 네이티브 변환은 후속 개발 항목입니다.</p></div></Modal>
    <Modal open={dialog === 'reanalyze'} onClose={() => setDialog(null)} title="현재 슬라이드를 다시 분석할까요?"><p className="modal-description">이 슬라이드의 기존 영역과 편집 내용이 새 분석 결과로 대체됩니다. 실행 취소로 이전 작업을 복원할 수 있습니다.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>취소</button><button className="button primary" onClick={analyze}>다시 분석</button></div></Modal>
    <Modal open={dialog === 'delete-slide'} onClose={() => setDialog(null)} title="슬라이드를 삭제할까요?"><p className="modal-description">‘{slide.name}’ 슬라이드를 프로젝트에서 제거합니다. 실행 취소로 되돌릴 수 있습니다.</p><div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>취소</button><button className="button danger" onClick={() => { commit({ ...project, slides: project.slides.filter(s => s.id !== slide.id) }); setSelected(null); setDialog(null); }}>슬라이드 삭제</button></div></Modal>
    {toast && <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>{toast.kind === 'error' ? <CircleHelp size={18} /> : <Check size={18} />}<span>{toast.text}</span><IconButton icon={X} label="알림 닫기" onClick={() => setToast(null)} /></div>}
    {busy && dialog !== 'export' && <div className="busy-overlay" role="status"><LoaderCircle className="spin" size={24} /><strong>{busy}</strong><span>잠시만 기다려 주세요.</span></div>}
    {dragOver && <div className="drop-overlay"><Upload size={40} /><strong>여기에 놓아 슬라이드를 추가하세요</strong><span>PNG · JPG · WEBP · PDF</span></div>}
  </div>;
}

export default App;

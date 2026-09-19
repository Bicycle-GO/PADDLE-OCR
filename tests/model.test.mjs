import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainBox, slideTransform, moveSlide, reviewCount } from '../src/model.js';
import { validateProject } from '../src/project.js';

test('dragging and resizing cannot put a layer beyond the source image', () => {
  assert.deepEqual(constrainBox({ x: 1000, y: -20, w: 300, h: 50 }, 1200, 675), { x: 900, y: 0, w: 300, h: 50 });
  assert.deepEqual(constrainBox({ x: 200, y: 300, w: 2000, h: 0 }, 1200, 675), { x: 0, y: 300, w: 1200, h: 12 });
});

test('portrait inputs retain their ratio inside a landscape PPTX', () => {
  const t = slideTransform(800, 1200, 12, 6.75);
  assert.equal(t.scale, 6.75 / 1200);
  assert.equal(t.y, 0);
  assert.equal(t.x, (12 - 800 * t.scale) / 2);
});

test('slide reordering preserves identity and guards both edges', () => {
  const slides = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(moveSlide(slides, 'b', -1).map(s => s.id), ['b', 'a', 'c']);
  assert.equal(moveSlide(slides, 'a', -1), slides);
  assert.equal(moveSlide(slides, 'c', 1), slides);
});

test('review counts include hidden unreviewed regions', () => {
  assert.equal(reviewCount([{ layers: [{ reviewed: true }, { reviewed: false, visible: false }] }]), 1);
});

test('project import rejects remote assets and invalid documents', () => {
  assert.throws(() => validateProject({ version: 1, slides: [] }));
  assert.throws(() => validateProject({ version: 1, slides: [{ width: 100, height: 100, source: 'https://example.com/image.png', layers: [], eraseRegions: [] }] }));
  assert.throws(() => validateProject({ version: 2, slides: [{}] }));
});

test('project import keeps text as data and clamps invalid coordinates', () => {
  const source = 'data:image/png;base64,AAAA';
  const project = validateProject({ version: 1, title: '복원', slides: [{ name: '슬라이드', width: 100, height: 100, source, layers: [{ type: 'text', box: { x: -10, y: 90, w: 40, h: 40 }, text: '<script>alert(1)</script>', fontSize: 32 }], eraseRegions: [] }] });
  assert.equal(project.slides[0].layers[0].text, '<script>alert(1)</script>');
  assert.equal(project.slides[0].layers[0].box.x, 0);
  assert.equal(project.slides[0].layers[0].box.y, 60);
});

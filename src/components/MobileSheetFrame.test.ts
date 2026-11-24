import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acquireBodyScrollLock,
  getMobileSheetFrameClasses,
  releaseBodyScrollLock,
  resetBodyScrollLockForTests,
} from './MobileSheetFrame.tsx';

test('getMobileSheetFrameClasses enforces bottom-anchored mobile sheet, 92dvh cap, and 44px close target', () => {
  const defaultClasses = getMobileSheetFrameClasses();
  const overlayTokens = defaultClasses.overlayClass.split(/\s+/);
  const surfaceTokens = defaultClasses.surfaceClass.split(/\s+/);
  const closeTokens = defaultClasses.closeButtonClass.split(/\s+/);

  assert.ok(overlayTokens.includes('items-end'));
  assert.ok(overlayTokens.includes('sm:items-center'));
  assert.ok(surfaceTokens.includes('max-h-[92dvh]'));
  assert.ok(surfaceTokens.includes('rounded-t-2xl'));
  assert.ok(surfaceTokens.includes('sm:rounded-2xl'));
  assert.ok(closeTokens.includes('min-h-[44px]'));
  assert.ok(closeTokens.includes('min-w-[44px]'));

  const paletteClasses = getMobileSheetFrameClasses({
    maxWidthClass: 'sm:max-w-xl',
    alignTopDesktop: true,
  });
  const paletteOverlayTokens = paletteClasses.overlayClass.split(/\s+/);
  const paletteSurfaceTokens = paletteClasses.surfaceClass.split(/\s+/);
  assert.ok(paletteOverlayTokens.includes('sm:items-start'));
  assert.ok(paletteSurfaceTokens.includes('sm:max-w-xl'));
});

test('body scroll lock uses reference counting across stacked modals', () => {
  resetBodyScrollLockForTests();
  const fakeDoc = {
    body: {
      style: { overflow: 'auto' },
    },
  } as unknown as Pick<Document, 'body'>;

  acquireBodyScrollLock(fakeDoc);
  assert.equal(fakeDoc.body.style.overflow, 'hidden');

  acquireBodyScrollLock(fakeDoc);
  assert.equal(fakeDoc.body.style.overflow, 'hidden');

  // Releasing one of two stacked sheets keeps body locked
  releaseBodyScrollLock(fakeDoc);
  assert.equal(fakeDoc.body.style.overflow, 'hidden');

  // Releasing final sheet restores original overflow value
  releaseBodyScrollLock(fakeDoc);
  assert.equal(fakeDoc.body.style.overflow, 'auto');

  // Extra release calls stay safe no-ops
  releaseBodyScrollLock(fakeDoc);
  assert.equal(fakeDoc.body.style.overflow, 'auto');
});

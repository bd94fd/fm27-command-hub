import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeMobileKeyboardState,
  isEditableInputElement,
  isMobileViewportWidth,
} from './useMobileKeyboard.ts';

test('isEditableInputElement distinguishes text controls from checkboxes, buttons, and readOnly fields', () => {
  assert.equal(isEditableInputElement({ tagName: 'TEXTAREA' }), true);
  assert.equal(isEditableInputElement({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isEditableInputElement({ tagName: 'INPUT', type: 'search' }), true);
  assert.equal(isEditableInputElement({ tagName: 'DIV', isContentEditable: true }), true);

  assert.equal(isEditableInputElement({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(isEditableInputElement({ tagName: 'INPUT', type: 'file' }), false);
  assert.equal(isEditableInputElement({ tagName: 'INPUT', type: 'range' }), false);
  assert.equal(isEditableInputElement({ tagName: 'TEXTAREA', readOnly: true }), false);
  assert.equal(isEditableInputElement({ tagName: 'INPUT', type: 'text', disabled: true }), false);
  assert.equal(isEditableInputElement({ tagName: 'BUTTON' }), false);
  assert.equal(isEditableInputElement(null), false);
});

test('isMobileViewportWidth triggers strictly below md breakpoint (768px)', () => {
  assert.equal(isMobileViewportWidth(360), true);
  assert.equal(isMobileViewportWidth(412), true);
  assert.equal(isMobileViewportWidth(767), true);
  assert.equal(isMobileViewportWidth(768), false);
  assert.equal(isMobileViewportWidth(1280), false);
});

test('computeMobileKeyboardState detects Android Chrome resizes-visual and resizes-content keyboards', () => {
  // Android Chrome resizes-visual: visualViewport shrinks while innerHeight stays tall
  const visualMode = computeMobileKeyboardState({
    viewportWidth: 390,
    innerHeight: 844,
    visualViewportHeight: 510,
    baselineHeight: 844,
    isEditableFocused: true,
  });
  assert.equal(visualMode.isKeyboardOpen, true);
  assert.equal(visualMode.keyboardHeight, 334);

  // Android Chrome resizes-content: both innerHeight and visualViewport shrink from baseline
  const contentMode = computeMobileKeyboardState({
    viewportWidth: 412,
    innerHeight: 520,
    visualViewportHeight: 520,
    baselineHeight: 860,
    isEditableFocused: true,
  });
  assert.equal(contentMode.isKeyboardOpen, true);
  assert.equal(contentMode.keyboardHeight, 340);

  // Small browser address-bar shift without keyboard must not hide nav
  const urlBarShift = computeMobileKeyboardState({
    viewportWidth: 390,
    innerHeight: 790,
    visualViewportHeight: 790,
    baselineHeight: 844,
    isEditableFocused: true,
  });
  assert.equal(urlBarShift.isKeyboardOpen, false);

  // When editable element blurs and viewport restores, nav returns
  const closed = computeMobileKeyboardState({
    viewportWidth: 390,
    innerHeight: 844,
    visualViewportHeight: 844,
    baselineHeight: 844,
    isEditableFocused: false,
  });
  assert.equal(closed.isKeyboardOpen, false);
  assert.equal(closed.keyboardHeight, 0);

  // Desktop viewports never report mobile keyboard open
  const desktop = computeMobileKeyboardState({
    viewportWidth: 1024,
    innerHeight: 800,
    visualViewportHeight: 450,
    baselineHeight: 800,
    isEditableFocused: true,
  });
  assert.equal(desktop.isKeyboardOpen, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { findFocusAnchor, trapTabKey } from './focusTrap.ts';

interface FakeControl {
  name: string;
  tabIndex: number;
  focused: number;
  getClientRects: () => unknown[];
  closest: () => null;
  focus: () => void;
}

function control(name: string): FakeControl {
  const el: FakeControl = {
    name,
    tabIndex: 0,
    focused: 0,
    getClientRects: () => [{}],
    closest: () => null,
    focus: () => {
      el.focused += 1;
    },
  };
  return el;
}

function surfaceWith(controls: FakeControl[]) {
  const surface = {
    focus: () => {
      surface.focused += 1;
    },
    focused: 0,
    querySelectorAll: () => controls,
  };
  return surface;
}

function keyEvent(key: string, shiftKey = false) {
  const event = {
    key,
    shiftKey,
    prevented: 0,
    preventDefault: () => {
      event.prevented += 1;
    },
  };
  return event;
}

test('Tab on the last control wraps to the first', () => {
  const first = control('first');
  const last = control('last');
  const surface = surfaceWith([first, last]);
  const event = keyEvent('Tab');

  const handled = trapTabKey(event, surface as never, last as never);

  assert.equal(handled, true);
  assert.equal(event.prevented, 1);
  assert.equal(first.focused, 1);
  assert.equal(last.focused, 0);
});

test('Shift+Tab on the first control wraps to the last', () => {
  const first = control('first');
  const last = control('last');
  const surface = surfaceWith([first, last]);
  const event = keyEvent('Tab', true);

  const handled = trapTabKey(event, surface as never, first as never);

  assert.equal(handled, true);
  assert.equal(last.focused, 1);
});

test('Shift+Tab from the surface itself goes to the last control', () => {
  const first = control('first');
  const last = control('last');
  const surface = surfaceWith([first, last]);
  const event = keyEvent('Tab', true);

  const handled = trapTabKey(event, surface as never, surface as never);

  assert.equal(handled, true);
  assert.equal(last.focused, 1);
});

test('Tab in the middle of the surface is left to the browser', () => {
  const first = control('first');
  const middle = control('middle');
  const last = control('last');
  const surface = surfaceWith([first, middle, last]);
  const event = keyEvent('Tab');

  const handled = trapTabKey(event, surface as never, middle as never);

  assert.equal(handled, false);
  assert.equal(event.prevented, 0);
});

test('a surface with nothing focusable keeps focus on itself', () => {
  const surface = surfaceWith([]);
  const event = keyEvent('Tab');

  const handled = trapTabKey(event, surface as never, null);

  assert.equal(handled, true);
  assert.equal(event.prevented, 1);
  assert.equal(surface.focused, 1);
});

test('keys other than Tab are ignored', () => {
  const first = control('first');
  const last = control('last');
  const surface = surfaceWith([first, last]);
  const event = keyEvent('Escape');

  assert.equal(trapTabKey(event, surface as never, last as never), false);
  assert.equal(event.prevented, 0);
});

test('a missing surface is not a trap', () => {
  assert.equal(trapTabKey(keyEvent('Tab'), null, null), false);
});

function fakeDoc(answers: Record<string, unknown>) {
  const calls: string[] = [];
  return {
    calls,
    querySelector: (selector: string) => {
      calls.push(selector);
      return (answers[selector] ?? null) as unknown;
    },
  };
}

test('the focus anchor prefers the current section button', () => {
  const current = { tag: 'current' };
  const firstNav = { tag: 'first-nav' };
  const nav = { querySelector: (selector: string) => (selector.includes('aria-current') ? current : firstNav) };
  const doc = fakeDoc({
    'nav[aria-label="Mobile navigation"], nav[aria-label="Primary sections"]': nav,
  });

  assert.equal(findFocusAnchor(doc as never), current as never);
});

test('the focus anchor falls back to the first navigation button', () => {
  const firstNav = { tag: 'first-nav' };
  const nav = { querySelector: (selector: string) => (selector.includes('aria-current') ? null : firstNav) };
  const doc = fakeDoc({
    'nav[aria-label="Mobile navigation"], nav[aria-label="Primary sections"]': nav,
  });

  assert.equal(findFocusAnchor(doc as never), firstNav as never);
});

test('the focus anchor falls back to a header control, then nothing', () => {
  const headerButton = { tag: 'header-button' };
  const withHeader = fakeDoc({ 'header button': headerButton });
  assert.equal(findFocusAnchor(withHeader as never), headerButton as never);

  assert.equal(findFocusAnchor(fakeDoc({}) as never), null);
  assert.equal(findFocusAnchor(null), null);
});

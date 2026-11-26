import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  __resetFeedbackBusForTests,
  emitFeedback,
  feedback,
  feedbackDuration,
  subscribeFeedback,
  UNDO_DURATION_MS,
  type FeedbackMessage,
} from './feedbackBus';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

test('every message gets a fresh id so a repeat of the same text still renders', () => {
  __resetFeedbackBusForTests();
  const seen: number[] = [];
  const off = subscribeFeedback((m) => seen.push(m.id));
  feedback.success('Synced');
  feedback.success('Synced');
  off();
  assert.equal(seen.length, 2);
  assert.notEqual(seen[0], seen[1]);
});

test('unsubscribing stops delivery', () => {
  __resetFeedbackBusForTests();
  let count = 0;
  const off = subscribeFeedback(() => {
    count += 1;
  });
  feedback.info('one');
  off();
  feedback.info('two');
  assert.equal(count, 1);
});

test('tone drives styling and screen-reader urgency', () => {
  __resetFeedbackBusForTests();
  assert.equal(emitFeedback({ text: 'ok' }).tone, 'success');
  assert.equal(feedback.error('bad').tone, 'error');
  assert.equal(feedback.info('note').tone, 'info');
  // An action without an explicit tone is informational, never a success claim.
  assert.equal(feedback.undo('Removed file', () => {}).tone, 'info');
});

test('errors stay up longer than confirmations, and undo longer than both', () => {
  assert.ok(feedbackDuration('error', false) > feedbackDuration('success', false));
  assert.equal(feedbackDuration('info', true), UNDO_DURATION_MS);
  assert.ok(UNDO_DURATION_MS >= 10000);
});

test('undo action is carried through untouched and runs on demand', async () => {
  __resetFeedbackBusForTests();
  let restored = 0;
  const received: FeedbackMessage[] = [];
  const off = subscribeFeedback((m) => {
    received.push(m);
  });
  const message = feedback.undo('Snapshot deleted', () => {
    restored += 1;
  });
  off();
  assert.equal(received[0]?.action?.label, 'Undo');
  assert.equal(restored, 0, 'undo must not run until it is asked for');
  await message.action?.run();
  assert.equal(restored, 1);
});

test('the toast host announces errors assertively and everything else politely', () => {
  const toast = read('src/components/FeedbackToast.tsx');
  // role, aria-live and aria-atomic must sit on the same element, or the live
  // region and the role can disagree about urgency.
  assert.match(
    toast,
    /role=\{isError \? 'alert' : 'status'\}\s+aria-live=\{isError \? 'assertive' : 'polite'\}\s+aria-atomic="true"/
  );
  assert.match(toast, /Message timer paused/);
  // Pausing on hover and focus is what keeps an undo affordance reachable.
  assert.match(toast, /onPointerEnter=\{pause\}/);
  assert.match(toast, /onFocus=\{pause\}/);
  // The action dismisses first, so a re-render cannot strand a dead toast.
  assert.match(toast, /onDismiss\(id\);[\s\S]{0,120}await message\.action\.run\(\)/);
});

test('the toast clears the bottom nav and stays keyboard reachable', () => {
  const toast = read('src/components/FeedbackToast.tsx');
  assert.match(toast, /bottom-\[calc\(5rem\+env\(safe-area-inset-bottom,0px\)\)\]/);
  assert.match(toast, /min-h-\[44px\]/);
  assert.match(toast, /aria-label="Dismiss message"/);
  assert.match(toast, /motion-safe:animate-feedback-in/);
});

test('motion yields to the OS reduce-motion preference', () => {
  const css = read('src/index.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-duration: 0\.01ms !important/);
  assert.match(css, /transition-duration: 0\.01ms !important/);
  assert.match(css, /scroll-behavior: auto !important/);
  assert.match(css, /--animate-feedback-in: feedback-in 180ms ease-out/);
});

test('snapshot deletion offers a real undo that writes the point back', () => {
  const panel = read('src/components/SaveSnapshotDiffPanel.tsx');
  assert.match(panel, /const removed = snapshots\.find\(\(point\) => point\.cacheKey === cacheKey\)/);
  assert.match(panel, /feedback\.undo\(/, 'deleting a snapshot must be reversible');
  assert.match(panel, /await putSaveHistoryPoint\(removed\)/);
  assert.match(panel, /feedback\.error\('Could not delete that snapshot/);
});

test('destructive clears confirm what happened, and clearing everything stays irreversible on purpose', () => {
  const panel = read('src/components/SaveSnapshotDiffPanel.tsx');
  assert.match(panel, /Snapshot history cleared/);
  const progression = read('src/components/SquadAnalyticsTable.tsx');
  assert.match(progression, /feedback\.success\('Progression archive cleared'\)/);
});

test('removing a chosen save file or screenshot can be undone', () => {
  const sync = read('src/components/AutoSyncWorkspace.tsx');
  assert.match(sync, /const removed = attachedFmFiles\.find/);
  assert.match(sync, /const removed = uploadedImages\[index\]/);
  assert.equal((sync.match(/feedback\.undo\(/g) ?? []).length, 2);
});

test('failures are reported as errors, not successes', () => {
  const app = read('src/App.tsx');
  assert.match(app, /tone: 'error'/);
  assert.doesNotMatch(app, /showGlobalToast\('Invalid FM27 backup file format\.'\)/);
});

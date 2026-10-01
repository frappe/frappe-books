import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GetStarted, fyo } from './helpers/ui.mjs';

function makePage() {
  const page = {};
  for (const [name, method] of Object.entries(GetStarted.methods)) {
    page[name] = method.bind(page);
  }
  return page;
}

function setSingles(getStarted) {
  const saved = [];
  fyo.singles.GetStarted = {
    ...getStarted,
    setAndSync: async (values) => saved.push(['GetStarted', values]),
  };
  fyo.singles.SystemSettings = {
    setAndSync: async (...values) => saved.push(['SystemSettings', ...values]),
  };
  return saved;
}

test('Get Started hides itself once the server finds every task done', async (t) => {
  t.mock.method(fyo, 'can', () => true);
  const page = makePage();

  let saved = setSingles({ onboarding_complete: false, tasks_complete: false });
  await page.hideWhenComplete();
  assert.deepEqual(saved, []);

  saved = setSingles({ onboarding_complete: false, tasks_complete: true });
  await page.hideWhenComplete();
  assert.deepEqual(saved, [
    ['GetStarted', { onboarding_complete: true }],
    ['SystemSettings', 'hide_get_started', true],
  ]);

  // Shown again by the user after it hid itself, it stays.
  saved = setSingles({ onboarding_complete: true, tasks_complete: true });
  await page.hideWhenComplete();
  assert.deepEqual(saved, []);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { getFileName, isFileUrl } from '../src/utils/files.ts';

test('only site file urls count as downloadable attachments', () => {
  assert.equal(isFileUrl('/files/logo.png'), true);
  assert.equal(isFileUrl('/private/files/bill%201.pdf'), true);
  for (const value of [
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'https://example.com/files/x.pdf',
    '/files/../api/method/logout',
    '/api/method/logout',
    null,
    { data: '/files/x.pdf' },
  ]) {
    assert.equal(isFileUrl(value), false, String(value));
  }
});

test('file names come from the url', () => {
  assert.equal(getFileName('/private/files/bill%201.pdf'), 'bill 1.pdf');
});

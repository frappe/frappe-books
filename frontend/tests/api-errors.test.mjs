import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { call, errors, loadTranslations } from './helpers/accounting.mjs';

before(() => {
  globalThis.window = { location: { hostname: 'books.localhost' } };
});
after(() => {
  delete globalThis.window;
});

function respondWith(status, excType) {
  const message = JSON.stringify({ message: 'Server says no' });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        exc_type: excType,
        _server_messages: JSON.stringify([message]),
      }),
      { status }
    );
}

const cases = [
  [417, 'ValidationError', errors.ValidationError],
  [417, 'UniqueValidationError', errors.ValidationError],
  [417, 'MandatoryError', errors.MandatoryError],
  [409, 'DuplicateEntryError', errors.DuplicateEntryError],
  [417, 'LinkExistsError', errors.LinkValidationError],
  [417, 'TimestampMismatchError', errors.ConflictError],
  [403, 'PermissionError', errors.ForbiddenError],
  [404, 'DoesNotExistError', errors.NotFoundError],
];

for (const [status, excType, ErrorClass] of cases) {
  test(`${excType} becomes ${ErrorClass.name}`, async () => {
    respondWith(status, excType);
    const error = await call('method').catch((error) => error);
    assert.ok(error instanceof ErrorClass);
    assert.equal(error.message, 'Server says no');
    assert.equal(error.shouldStore, false);
  });
}

test('an unexpected server error stays a plain error', async () => {
  respondWith(500, 'ZeroDivisionError');
  const error = await call('method').catch((error) => error);
  assert.ok(!(error instanceof errors.BaseError));
  assert.equal(error.message, 'Server says no');
});

test('an unreachable server surfaces the network error', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  const error = await call('method').catch((error) => error);
  assert.ok(error instanceof TypeError);
});

test('translations load with a GET for the language', async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push([url, options.method]);
    return Response.json({ message: { Invoice: 'Facture {0}' } });
  };

  const map = await loadTranslations('fr');

  assert.deepEqual(requests, [
    ['/api/method/frappe.translate.get_boot_translations?lang=fr', 'GET'],
  ]);
  assert.equal(map.Invoice.translation, 'Facture ${0}');
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import {
  call,
  errors,
  getDocuments,
  getServerMessages,
  insertDocument,
  loadTranslations,
  onServerMessages,
} from './helpers/accounting.mjs';

const LOGIN_URL = '/login?redirect-to=%2Fbooks';

before(() => {
  globalThis.window = { location: { hostname: 'books.localhost' } };
  globalThis.document = { cookie: 'user_id=Administrator; user_lang=en' };
});
after(() => {
  delete globalThis.window;
  delete globalThis.document;
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

/** Where the request sent the browser, once it has had time to settle. */
async function getRedirect(request) {
  window.location.href = undefined;
  let settled = false;
  request.then(
    () => (settled = true),
    () => (settled = true)
  );
  await setImmediate();
  return { href: window.location.href, settled };
}

test('an expired session sends the user to log in, not to an error', async () => {
  respondWith(401, 'SessionExpired');
  const result = await getRedirect(call('method'));
  assert.deepEqual(result, { href: LOGIN_URL, settled: false });
});

test('a document request after a logout elsewhere sends the user to log in', async () => {
  globalThis.document.cookie = 'user_lang=en';
  globalThis.fetch = async () =>
    Response.json(
      { errors: [{ type: 'PermissionError', message: 'Not permitted' }] },
      { status: 403 }
    );

  const result = await getRedirect(getDocuments('Books Item', {}));

  globalThis.document.cookie = 'user_id=Administrator; user_lang=en';
  assert.deepEqual(result, { href: LOGIN_URL, settled: false });
});

test("a Guest session's refusal sends the user to log in", async () => {
  globalThis.document.cookie = 'user_id=Guest';
  respondWith(403, 'PermissionError');

  const result = await getRedirect(call('method'));

  globalThis.document.cookie = 'user_id=Administrator; user_lang=en';
  assert.deepEqual(result, { href: LOGIN_URL, settled: false });
});

test("a signed-in user's refusal stays an error", async () => {
  respondWith(403, 'PermissionError');
  const result = await getRedirect(call('method'));
  assert.deepEqual(result, { href: undefined, settled: true });
});

const ALERT = { message: 'Item Price added', alert: 1, indicator: 'green' };

test('a failed request drops its alerts, as it kept nothing they announce', async () => {
  const thrown = { message: 'Rate is required', indicator: 'red' };
  globalThis.fetch = async () =>
    Response.json(
      {
        exc_type: 'ValidationError',
        _server_messages: JSON.stringify(
          [ALERT, thrown].map((m) => JSON.stringify(m))
        ),
      },
      { status: 417 }
    );

  const error = await call('method').catch((error) => error);

  assert.deepEqual(getServerMessages(error), [thrown]);
});

test('an error Frappe linked to an alert says what failed instead', async () => {
  globalThis.fetch = async () =>
    Response.json(
      {
        errors: [
          {
            type: 'TypeError',
            exception:
              "Traceback\nTypeError: 'NoneType' object is not callable\n",
            ...ALERT,
          },
        ],
      },
      { status: 500 }
    );

  const error = await insertDocument('Purchase Receipt', {}).catch((e) => e);

  assert.deepEqual(
    getServerMessages(error).map(({ message }) => message),
    ["TypeError: 'NoneType' object is not callable"]
  );
});

test('a successful request shows what the server logged', async () => {
  const shown = [];
  onServerMessages((messages) => shown.push(...messages));
  globalThis.fetch = async () =>
    Response.json({ data: { name: 'PR-1' }, messages: [ALERT] });
  await insertDocument('Purchase Receipt', {});
  globalThis.fetch = async () =>
    Response.json({
      message: 'ok',
      _server_messages: JSON.stringify([JSON.stringify(ALERT)]),
    });
  await call('method');

  onServerMessages(() => undefined);
  assert.deepEqual(shown, [ALERT, ALERT]);
});

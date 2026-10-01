import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBooksMeta } from './helpers/doctypes.mjs';
import {
  frappeModels,
  fyo,
  GeneralLedger,
  getLinkDisplayValue,
  loadFrappeDocTypes,
  registerFrappeModels,
  searchFrappeLink,
  setLanguageMapOnTranslationString,
  stubFrappe,
} from './helpers/frappe.mjs';

let respond = () => ({ message: [] });
const requests = stubFrappe((request) =>
  request.path.endsWith('get_books_meta')
    ? { message: getBooksMeta(request.body.doctypes) }
    : respond(request)
);
registerFrappeModels(frappeModels);
await loadFrappeDocTypes();

function inGerman(callback) {
  return async () => {
    setLanguageMapOnTranslationString({
      Cash: { translation: 'Kasse' },
      Asha: { translation: 'Ascha' },
    });
    try {
      await callback();
    } finally {
      setLanguageMapOnTranslationString(undefined);
    }
  };
}

test(
  'a link to an account shows its name in the user language',
  inGerman(async () => {
    assert.equal(await getLinkDisplayValue('Account', 'Cash'), 'Kasse');
    assert.equal(await getLinkDisplayValue('Account', 'My Cash'), 'My Cash');
  })
);

test(
  'accounts are searched and offered by their names in the user language',
  inGerman(async () => {
    respond = () => ({ message: [{ name: 'Cash' }] });
    requests.length = 0;

    const options = await searchFrappeLink('Account', 'Kas', null, 10);

    assert.deepEqual(
      options.map(({ label, value }) => [label, value]),
      [['Kasse', 'Cash']]
    );
    // Frappe matches a translated doctype's names in Python, so letters are not spread.
    assert.deepEqual(
      [requests[0].body.doctype, requests[0].body.txt],
      ['Books Account', 'Kas']
    );
  })
);

test(
  'report cells show account names in the user language and other links as stored',
  inGerman(async () => {
    respond = () => ({
      message: {
        columns: [
          { fieldname: 'account', fieldtype: 'Link', options: 'Books Account' },
          { fieldname: 'party', fieldtype: 'Link', options: 'Books Party' },
        ],
        result: [{ account: 'Cash', party: 'Asha' }],
      },
    });
    const report = new GeneralLedger(fyo);

    await report.setReportData();

    const [account, party] = report.reportData[0].cells;
    assert.deepEqual([account.value, account.rawValue], ['Kasse', 'Cash']);
    assert.deepEqual([party.value, party.rawValue], ['Asha', 'Asha']);
  })
);

test('an English user sees account names as stored', async () => {
  assert.equal(await getLinkDisplayValue('Account', 'Cash'), 'Cash');
});

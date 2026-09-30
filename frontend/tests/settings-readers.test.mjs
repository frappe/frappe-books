import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { doctypes } from './helpers/doctypes.mjs';
import { FrappeDoc, frappeModels } from './helpers/frappe.mjs';

const frontend = new URL('../', import.meta.url);
const SOURCE_FOLDERS = ['fyo', 'models', 'reports', 'src', 'utils'];
// `fyo.singles.X?.field`, `.get('field')`, `.set('field'` and `.setAndSync('field'`.
const READ = /singles\??\.(\w+)\s*[?!]?\s*\.\s*(\w+)(?:\(\s*'(\w+)')?/g;
const FIELD_ARGUMENT_METHODS = ['get', 'set', 'setAndSync'];

test('settings served by Frappe are read by their Frappe fieldnames', () => {
  const fieldnames = getSingleFieldnames();
  const problems = getSourceFiles().flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(READ)]
      .map(([, single, member, argument]) => {
        const known = fieldnames[single];
        const fieldname = FIELD_ARGUMENT_METHODS.includes(member)
          ? argument
          : member;
        const isKnown =
          !known ||
          (fieldname === member && member in FrappeDoc.prototype) ||
          !fieldname ||
          known.has(fieldname);
        const path = file.pathname.slice(frontend.pathname.length);
        return isKnown ? '' : `${path}: ${single}.${fieldname}`;
      })
      .filter(Boolean)
  );
  assert.deepEqual(problems, []);
});

/** Fieldnames of each Frappe-backed single, by schema name. */
function getSingleFieldnames() {
  const singles = {};
  for (const [schemaName, Model] of Object.entries(frappeModels)) {
    const doctype = doctypes.find(({ name }) => name === Model.doctype);
    if (doctype?.issingle) {
      singles[schemaName] = new Set(doctype.fields.map((f) => f.fieldname));
    }
  }

  return singles;
}

function getSourceFiles() {
  return SOURCE_FOLDERS.flatMap((folder) =>
    readdirSync(new URL(folder, frontend), { recursive: true })
      .filter((path) => /\.(ts|vue)$/.test(path))
      .map((path) => new URL(`${folder}/${path}`, frontend))
  );
}

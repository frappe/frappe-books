import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { DataImport } from './helpers/accounting.mjs';
import { stubServer } from './helpers/server.mjs';

const METHODS = 'frappe.core.doctype.data_import.data_import';

afterEach(() => {
  delete globalThis.window;
  delete globalThis.XMLHttpRequest;
});

/** Answers frappe-ui uploads with `fileUrl` and records the form fields sent. */
function stubUpload(fileUrl) {
  const uploads = [];
  globalThis.XMLHttpRequest = class {
    upload = { addEventListener() {} };
    addEventListener() {}
    open() {}
    setRequestHeader() {}
    send(form) {
      uploads.push(
        Object.fromEntries([...form.keys()].map((key) => [key, form.get(key)]))
      );
      Object.assign(this, {
        readyState: 4,
        status: 200,
        responseText: JSON.stringify({ message: { file_url: fileUrl } }),
      });
      this.onreadystatechange();
    }
  };
  globalThis.XMLHttpRequest.DONE = 4;
  return uploads;
}

test('the grid file is attached to a new Data Import, which lists missing links', async () => {
  const calls = stubServer((method) =>
    method === 'frappe.client.insert'
      ? { name: 'DI-1' }
      : {
          value_mappings: [
            {
              fieldtype: 'Link',
              link_doctype: 'Books Account',
              source_value: 'Nope',
            },
            { fieldtype: 'Select', link_doctype: null, source_value: 'Both?' },
          ],
        }
  );
  const uploads = stubUpload('/private/files/Party.csv');

  const dataImport = await DataImport.insert('Books Party', false);
  await dataImport.setFile('docstatus,name\r\n0,Ann', 'Party.csv');

  assert.deepEqual(calls[0].args.doc, {
    doctype: 'Data Import',
    reference_doctype: 'Books Party',
    import_type: 'Insert New Records',
    submit_after_import: 0,
  });
  assert.deepEqual(
    { ...uploads[0], file: uploads[0].file.name },
    {
      file: 'Party.csv',
      is_private: '1',
      folder: 'Home',
      doctype: 'Data Import',
      docname: 'DI-1',
      fieldname: 'import_file',
    }
  );
  assert.deepEqual(calls[1], {
    method: 'frappe.client.set_value',
    args: {
      doctype: 'Data Import',
      name: 'DI-1',
      fieldname: 'import_file',
      value: '/private/files/Party.csv',
    },
  });
  assert.deepEqual(dataImport.missingLinks, [
    { doctype: 'Books Account', name: 'Nope' },
  ]);
});

test('an import is polled until Frappe finishes and its failures are read back', async () => {
  const statuses = [
    { status: 'In Progress', processed_records: 1, total_records: 2 },
    { status: 'Partial Success', processed_records: 2, total_records: 2 },
  ];
  const calls = stubServer((method, args) => {
    if (method === `${METHODS}.get_import_status`) {
      return statuses.shift();
    }
    if (method === `${METHODS}.get_import_logs`) {
      return args.status === 'failed'
        ? [
            {
              docname: null,
              messages: JSON.stringify([{ message: 'Customer is required' }]),
              exception: 'Traceback\nfrappe.exceptions.MandatoryError: party',
              row_indexes: '[3, 4]',
            },
          ]
        : [
            {
              docname: 'SINV-1001',
              messages: '"[]"',
              exception: null,
              row_indexes: '[2]',
            },
          ];
    }
    return true;
  });

  const dataImport = new DataImport('DI-1', true);
  const progress = [];
  const warnings = await dataImport.run((step) => progress.push(step));

  assert.deepEqual(warnings, []);
  assert.deepEqual(progress, [{ processed: 1, total: 2 }]);
  assert.deepEqual(calls[0], {
    method: `${METHODS}.form_start_import`,
    args: { data_import: 'DI-1' },
  });
  assert.deepEqual(await dataImport.getLogs('failed'), [
    { docname: null, message: 'Customer is required', rows: [3, 4] },
  ]);
  assert.deepEqual(await dataImport.getLogs('success'), [
    { docname: 'SINV-1001', message: '', rows: [2] },
  ]);
});

test('an import Frappe refuses returns the reasons it saved', async () => {
  stubServer((method) => {
    if (method === `${METHODS}.get_import_status`) {
      return { status: 'Pending' };
    }
    if (method === 'frappe.client.get_value') {
      return {
        template_warnings: JSON.stringify([{ message: 'Row 2: bad date' }]),
      };
    }
    return true;
  });

  const warnings = await new DataImport('DI-1', false).run(() => {});

  assert.deepEqual(warnings, ['Row 2: bad date']);
});

test('an import that stops before any row fails loudly', async () => {
  stubServer((method) =>
    method === `${METHODS}.get_import_status`
      ? { status: 'Error', processed_records: 0 }
      : true
  );

  await assert.rejects(
    new DataImport('DI-1', false).run(() => {}),
    /Error Log/
  );
});

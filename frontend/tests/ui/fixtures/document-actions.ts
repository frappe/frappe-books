import { Button, FrappeUI, FrappeUIProvider } from 'frappe-ui';
import { createApp, h, reactive } from 'vue';
import 'src/router';
import { FrappeDoc } from 'src/frappe/document';
import { registerFrappeModels } from 'src/frappe/doctypes';
import { newFrappeDoc } from 'src/frappe/documents';
import { loadFrappeDocTypes } from 'src/frappe/registry';
import { commonDocSubmit, commonDocSync } from 'src/utils/ui';
import 'src/styles/index.css';

const recordMeta = {
  name: 'Books Record',
  autoname: 'Prompt',
  is_submittable: 1,
  permissions: [],
  fields: [{ fieldname: 'value', fieldtype: 'Data', label: 'Value' }],
};

class TestRecord extends FrappeDoc {
  static doctype = 'Books Record';
  static presentation = { label: 'Record' };
}

async function mount() {
  const state = reactive({
    fail: false,
    pending: false,
    calls: 0,
    result: null as boolean | null,
  });
  let release: (() => void) | undefined;
  let stored: Record<string, unknown> = {};
  // Saves and submits store what they are sent, unless the fixture rejects them.
  const persist = async (values: Record<string, unknown>) => {
    state.calls++;
    if (state.pending) await new Promise<void>((resolve) => (release = resolve));
    // An untyped server failure, which /books shows as a plain error.
    if (state.fail) {
      const errors = [{ message: 'Write rejected' }];
      return Response.json({ errors }, { status: 500 });
    }

    stored = { ...values, modified: '2026-10-01 10:00:00.000000' };
    return Response.json({ data: stored, docs: [stored] });
  };
  (window as any).frappe = {
    boot: { user: { name: 'Administrator', roles: [] } },
  };
  window.fetch = async (input, init = {}) => {
    const path = decodeURIComponent(new URL(String(input), location.href).pathname);
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (path.endsWith('get_books_meta')) {
      return Response.json({ message: { metas: [recordMeta], placements: {} } });
    }

    if (path.endsWith('run_doc_method')) {
      return await persist({ ...body.document, docstatus: 1 });
    }

    return init.method === 'GET' ? Response.json({ data: stored }) : await persist(body);
  };
  registerFrappeModels({ Record: TestRecord });
  await loadFrappeDocTypes();
  const doc = newFrappeDoc('Record', {
    name: 'Dialog record',
    value: 'Unsaved edit',
  });

  const app = createApp({
    render: () =>
      h(FrappeUIProvider, {}, {
        default: () => h('main', { class: 'p-6' }, [
          h('input', {
            'aria-label': 'Value',
            value: doc.value,
            onChange: (event: Event) =>
              doc.set('value', (event.target as HTMLInputElement).value),
          }),
          doc.canSave && h(Button, {
            onClick: async () => {
              state.result = await commonDocSync(doc, true);
            },
          }, () => 'Save'),
          doc.canSubmit && h(Button, {
            onClick: async () => {
              state.result = await commonDocSubmit(doc);
            },
          }, () => 'Submit'),
        ]),
      }),
  });
  app.use(FrappeUI);
  app.mount('#app');
  (window as any).documentActions = {
    doc,
    state,
    release: () => release?.(),
  };
}

void mount();

import { Button, FrappeUI, FrappeUIProvider } from 'frappe-ui';
import { createApp, h, reactive } from 'vue';
import { fyo } from 'src/initFyo';
import 'src/router';
import { commonDocSubmit, commonDocSync } from 'src/utils/ui';
import { FrappeDatabaseDemux } from 'src/web/databaseDemux';
import 'src/styles/index.css';

async function mount() {
  FrappeDatabaseDemux.prototype.getSchemaMap = async () => ({
    Record: {
      name: 'Record',
      label: 'Record',
      naming: 'manual',
      isSubmittable: true,
      fields: [
        { fieldname: 'name', fieldtype: 'Data', required: true },
        { fieldname: 'value', fieldtype: 'Data' },
        { fieldname: 'submitted', fieldtype: 'Check' },
        { fieldname: 'cancelled', fieldtype: 'Check' },
      ],
    },
  });
  await fyo.db.init();
  fyo.doc.registerModels({});
  const doc = fyo.doc.getNewDoc('Record', {
    name: 'Dialog record',
    value: 'Unsaved edit',
  });
  const state = reactive({
    fail: false,
    pending: false,
    calls: 0,
    result: null as boolean | null,
  });
  let release: (() => void) | undefined;
  const persist = async () => {
    state.calls++;
    if (state.pending) await new Promise<void>((resolve) => (release = resolve));
    if (state.fail) throw new Error('Write rejected');
    return doc.getValidDict();
  };
  fyo.db.get = async () => doc.getValidDict();
  fyo.db.insert = persist;
  fyo.db.update = persist;
  fyo.db.runLifecycleAction = async () => ({
    ...(await persist()),
    submitted: true,
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

import { fyo } from 'src/initFyo';
import 'src/router';
import { createApp, h, reactive, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { FrappeUI, FrappeUIProvider } from 'frappe-ui';
import { models } from 'models';
import { StockBalance } from 'reports/inventory/StockBalance';
import type { Field } from 'schemas/types';
import Check from 'src/components/Controls/Check.vue';
import CommonFormSection from 'src/pages/CommonForm/CommonFormSection.vue';
import ReportPage from 'src/pages/Report.vue';
import { languageDirectionKey } from 'src/utils/injectionKeys';
import { FrappeDatabaseDemux } from 'src/web/databaseDemux';
import 'src/styles/index.css';
import { getTestSchemas } from './schemas';

async function mount() {
  FrappeDatabaseDemux.prototype.getSchemaMap = async () => getTestSchemas();
  await fyo.db.init();
  fyo.doc.registerModels(models);
  fyo.singles.InventorySettings = {
    enableBatches: true,
    enableSerialNumber: true,
  } as any;
  fyo.singles.SystemSettings = { dateFormat: 'MMM d, y' } as any;
  const report = reactive(new StockBalance(fyo));
  // Only the report rows are stubbed; filters and their updates use the real model.
  report._getReportData = async () => [
    {
      cells: report.columns.map((column) => ({
        value: column.fieldname === 'item' ? 'Wireless Keyboard' : '1',
      })),
    },
  ];
  await report.initialize();
  const reportPage = {
    ...ReportPage,
    data: () => ({ report, loading: false }),
  };
  const doc = reactive(
    fyo.doc.getNewDoc('Item', { name: 'Wireless Keyboard' })
  );
  const state = reactive({
    view: 'report',
    value: false,
    readOnly: false,
    showLabel: true,
    size: 'small',
    label: 'Include serial numbers when exporting inventory movements',
  });
  const serial: Field = {
    fieldtype: 'Check',
    fieldname: 'serialNumber',
    label: 'Track serial numbers',
  };
  const app = createApp({
    render() {
      let content;
      if (state.view === 'report') {
        content = h(reportPage, { reportClassName: 'StockBalance' });
      } else if (state.view === 'form') {
        const fields: Field[] = [
          { fieldtype: 'Data', fieldname: 'description', label: 'Description' },
          serial,
          ...(doc.serialNumber
            ? [
                {
                  fieldtype: 'Check',
                  fieldname: 'batch',
                  label: 'Track batches',
                } as Field,
              ]
            : []),
          { fieldtype: 'Data', fieldname: 'barcode', label: 'Barcode' },
        ];
        content = h(CommonFormSection, {
          style: 'width: 640px; padding: 24px',
          doc,
          fields,
          errors: {},
          onValueChange: (field: Field, value: boolean) => {
            doc[field.fieldname] = value;
          },
        });
      } else {
        content = h(Check, {
          style: 'width: 180px; margin: 24px',
          df: { ...serial, label: state.label },
          showLabel: state.showLabel,
          size: state.size,
          value: state.value,
          readOnly: state.readOnly,
          onChange: (value: boolean) => {
            state.value = value;
          },
        });
      }
      return h(FrappeUIProvider, {}, { default: () => content });
    },
  });
  app.use(FrappeUI);
  app.use(
    createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { render: () => null } }],
    })
  );
  app.mixin({
    computed: { fyo: () => fyo, platform: () => 'Web' },
    methods: { t: fyo.t, T: fyo.T },
  });
  app.provide(languageDirectionKey, ref('ltr'));
  app.mount('#app');
  (window as any).checkboxFixture = { state, report, doc };
}

void mount();

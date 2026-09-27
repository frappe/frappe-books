import { fyo } from 'src/initFyo';
import { createApp, h, reactive, ref } from 'vue';
import { FrappeUI, FrappeUIProvider } from 'frappe-ui';
import { ConfigProvider } from 'reka-ui';
import { createRouter, createMemoryHistory } from 'vue-router';
import 'src/router';
import POS from 'src/pages/POS/POS.vue';
import Link from 'src/components/Controls/Link.vue';
import { languageDirectionKey } from 'src/utils/injectionKeys';
import { preparePOSData, shift } from './pos-data';
import 'src/styles/index.css';

async function mount() {
  const items = await preparePOSData();
  const state = reactive({
    linkControl: null as Record<string, unknown> | null,
    invoice: null as any,
  });
  const posRef = ref<any>();
  const app = createApp({
    render() {
      if (state.linkControl) {
        return h(ConfigProvider, { dir: state.linkControl.dir as 'ltr' | 'rtl' }, {
          default: () =>
            h(FrappeUIProvider, {}, {
              default: () =>
                h('main', { class: 'max-w-lg p-6' }, [
                  h(Link, {
                    border: true,
                    df: {
                      fieldtype: 'Link',
                      fieldname: 'party',
                      label: 'Customer',
                      target: 'Party',
                    },
                    value: state.invoice.party,
                    ...state.linkControl,
                    onChange: (value: string) => {
                      state.invoice.party = value;
                    },
                  }),
                ]),
            }),
        });
      }
      return h(FrappeUIProvider, {}, { default: () => h(POS, { ref: posRef }) });
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

  while (!posRef.value?.items.length) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const pos = posRef.value;
  await pos.setCustomer('Aarav Shah');
  pos.selectedItemForBatch = items[0].name;
  pos.setPaymentMethod('Cash');
  state.invoice = pos.sinvDoc;

  (window as any).posFixture = {
    state,
    fyo,
    pos,
    showModal(name: string) {
      pos.closeAllModals();
      pos.toggleModal(name, true);
    },
    setLayout(modern: boolean) {
      pos.posProfile = { posUI: modern ? 'Modern' : 'Classic' };
    },
    closeShift() {
      shift.open = false;
      pos.isPosShiftOpen = false;
    },
    fillCart() {
      state.invoice.items = items.slice(0, 3).map((item, index) =>
        fyo.doc.getNewDoc('SalesInvoiceItem', {
          name: `row-${index}`,
          item: item.name,
          quantity: 2,
          transferQuantity: 2,
          rate: String(item.rate),
          amount: String(item.rate.mul(2)),
          itemDiscountedTotal: String(item.rate.mul(2)),
          unit: 'Unit',
          parent: 'POS-AUDIT',
          parentSchemaName: 'SalesInvoice',
          parentFieldname: 'items',
        })
      ) as any;
      for (const field of [
        'netTotal',
        'grandTotal',
        'baseGrandTotal',
        'outstandingAmount',
      ]) {
        state.invoice[field] = fyo.pesa(2250);
      }
    },
  };
}
mount();

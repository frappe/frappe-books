import { fyo } from 'src/initFyo';
import { createApp, h, reactive, ref } from 'vue';
import { FrappeUI, FrappeUIProvider, MobileShell } from 'frappe-ui';
import { ConfigProvider } from 'reka-ui';
import { createRouter, createMemoryHistory } from 'vue-router';
import 'src/router';
import POS from 'src/pages/POS/POS.vue';
import Link from 'src/components/Controls/Link.vue';
import DialogSheet from 'src/mobile/DialogSheet.vue';
import { provideMobileFooter } from 'src/mobile/provideMobileFooter';
import { languageDirectionKey, shortcutsKey } from 'src/utils/injectionKeys';
import { Shortcuts } from 'src/utils/shortcuts';
import { isMobile } from 'src/utils/viewport';
import { newFrappeDoc } from 'src/frappe/documents';
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
    setup: () => ({ footer: provideMobileFooter() }),
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
      // Desk.vue bounds the page height, so POS scrolls inside its grid.
      // Phones scroll the page in the shell, as MobileDesk.vue does.
      const pos = () => h(POS, { ref: posRef, class: 'min-w-0 flex-1' });
      return h(FrappeUIProvider, {}, {
        default: () =>
          isMobile.value
            ? [
                h(MobileShell, {}, {
                  default: pos,
                  nav: () => h('div', { ref: this.footer.target }),
                }),
                h(DialogSheet),
              ]
            : h('div', { class: 'flex h-screen overflow-hidden' }, [pos()]),
      });
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
  const shortcuts = new Shortcuts();
  shortcuts.start();
  app.provide(shortcutsKey, shortcuts);
  app.mount('#app');

  while (!posRef.value?.items.length) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const pos = posRef.value;
  // The app registers POS shortcuts when its kept-alive page activates.
  pos.setShortcuts();
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
      pos.posProfile = { pos_ui: modern ? 'Modern' : 'Classic' };
    },
    closeShift() {
      shift.open = false;
      pos.isPosShiftOpen = false;
    },
    /** Loads a saved, unsubmitted invoice as the Saved Invoices sheet does. */
    openSavedInvoice() {
      const invoice = newFrappeDoc('SalesInvoice', {
        name: 'SINV-SAVED',
        is_pos: true,
        items: [{ item: items[0].name, quantity: 1, transfer_quantity: 1 }],
      });
      invoice._notInserted = false;
      pos.sinvDoc = invoice;
    },
    fillCart() {
      state.invoice.items = [];
      items.slice(0, 3).forEach((item, index) =>
        state.invoice.push('items', {
          name: `row-${index}`,
          item: item.name,
          quantity: 2,
          transfer_quantity: 2,
          rate: item.rate,
          transfer_rate: item.rate,
          amount: item.rate.mul(2),
          item_discounted_total: item.rate.mul(2),
          unit: 'Unit',
        })
      );
      for (const field of [
        'net_total',
        'grand_total',
        'base_grand_total',
        'outstanding_amount',
      ]) {
        state.invoice[field] = fyo.pesa(2250);
      }
    },
    /** A row sold in boxes of 50, as the server prices it: 62 a unit, 3,100 a box. */
    fillBoxRow() {
      fyo.singles.InventorySettings!.enable_uom_conversions = true;
      state.invoice.items = [];
      state.invoice.push('items', {
        name: 'row-box',
        item: items[0].name,
        unit: 'Unit',
        transfer_unit: 'Box',
        unit_conversion_factor: 50,
        transfer_quantity: 6,
        quantity: 300,
        rate: fyo.pesa(62),
        transfer_rate: fyo.pesa(3100),
        amount: fyo.pesa(18600),
      });
    },
  };
}
mount();

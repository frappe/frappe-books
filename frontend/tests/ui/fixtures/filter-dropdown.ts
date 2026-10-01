import { escapeRegExp } from 'lodash';
import { createApp, h, reactive, ref } from 'vue';
import { FrappeUI, FrappeUIProvider } from 'frappe-ui';
import { fyo } from 'src/initFyo';
// Load the router before the controls that import it, as the app does.
import 'src/router';
import List from 'src/pages/ListView/List.vue';
import FilterDropdown from 'src/components/FilterDropdown.vue';
import { frappeModels } from 'models';
import type { Filter } from 'src/frappe/api';
import { toSchemaName } from 'src/frappe/registry';
import { languageDirectionKey } from 'src/utils/injectionKeys';
import 'src/styles/index.css';
import { loadFrappeFixture } from './frappe';

// Fields only this fixture adds to items, to filter by an option label and a suggestion.
const itemFields = [
  {
    fieldname: 'customChoice',
    fieldtype: 'Select',
    label: 'Custom Choice',
    read_only: 1,
    reqd: 1,
    default: 'code-one',
    options: 'code-one\ncode-two',
  },
  {
    fieldname: 'customSuggestion',
    fieldtype: 'Autocomplete',
    label: 'Custom Suggestion',
    options: 'One\nTwo',
  },
];

async function mount() {
  const { Item } = frappeModels;
  Item.presentation = {
    ...Item.presentation,
    fields: {
      ...Item.presentation.fields,
      customChoice: {
        optionLabels: { 'code-one': 'First label', 'code-two': 'Second label' },
        // A read-only field filters lists only when it says so.
        filter: true,
      },
    },
  };
  const state = reactive({
    applied: [] as Filter[],
    schemaName: 'SalesInvoice',
    lookupFailure: false,
    lookupCalls: [] as string[],
  });
  const invoices = Array.from({ length: 60 }, (_, index) => ({
    name: `INV-${index + 1}`,
    party: 'Test customer',
    date: '2024-01-01 00:00:00',
    docstatus: 1,
    grand_total: 100,
    base_grand_total: 100,
    status: ['Paid', 'Partly Paid', 'Unpaid'][index % 3],
  }));
  const queryRows = (filters: Filter[] = []) =>
    invoices.filter((row) => matchesStatus(row.status, filters));
  const lookupRows = (schemaName: string) => {
    state.lookupCalls.push(schemaName);
    if (state.lookupFailure) throw new Error('Lookup unavailable');
    if (schemaName === 'User')
      return [{ name: 'Administrator' }, { name: 'Guest' }];
    return schemaName === 'NumberSeries'
      ? [{ name: 'JV-' }, { name: 'BANK-' }]
      : [{ name: `${schemaName}-001` }, { name: `${schemaName}-002` }];
  };
  const getSchemaName = (doctype: string) => toSchemaName(doctype) ?? doctype;
  await loadFrappeFixture(
    (path, body, params) => {
      // The server's link search takes `%` as any text, so typed letters match in order.
      if (path.endsWith('frappe.desk.search.search_widget')) {
        const words = body.txt.toLowerCase().split('%').map(escapeRegExp);
        const pattern = new RegExp(words.join('.*'));
        const rows = lookupRows(getSchemaName(body.doctype));
        const found = rows.filter(({ name }) =>
          pattern.test(name.toLowerCase())
        );
        return { message: found };
      }

      // The list's own page; other doctypes are looked up.
      if (path.endsWith('frappe.client.get_list')) {
        const schemaName = getSchemaName(body.doctype);
        if (schemaName !== state.schemaName) {
          return { message: lookupRows(schemaName) };
        }

        const start = body.limit_start ?? 0;
        const end = start + body.limit_page_length;
        return { message: queryRows(body.filters).slice(start, end) };
      }

      if (path.endsWith('/count')) {
        return { data: queryRows(params.filters).length };
      }

      const start = params.start ?? 0;
      return {
        data: queryRows(params.filters).slice(start, start + params.limit),
      };
    },
    { 'Books Item': itemFields }
  );
  fyo.singles.SystemSettings = { currency: 'USD', display_precision: 2 } as any;
  const list = ref<InstanceType<typeof List>>();
  const filter = ref<InstanceType<typeof FilterDropdown>>();
  const app = createApp({
    render: () =>
      h(
        FrappeUIProvider,
        {},
        {
          default: () =>
            h('main', { class: 'min-h-screen bg-surface-gray-1' }, [
              h(
                'header',
                {
                  class:
                    'flex h-16 items-center justify-between border-b border-outline-gray-1 bg-surface-white px-5',
                },
                [
                  h('h1', { class: 'text-lg font-semibold' }, 'Sales Invoice'),
                  h(FilterDropdown, {
                    ref: filter,
                    schemaName: state.schemaName,
                    onChange: (filters: Filter[]) => {
                      state.applied = filters;
                      void list.value?.updateData(filters);
                    },
                  }),
                ]
              ),
              h(List, {
                ref: list,
                schemaName: state.schemaName,
                listConfig: { columns: ['name'] },
                class: 'h-[calc(100vh-4rem)]',
              }),
            ]),
        }
      ),
  });
  app.use(FrappeUI);
  app.mixin({
    computed: { fyo: () => fyo },
    methods: { t: fyo.t, T: fyo.T },
  });
  app.provide(languageDirectionKey, ref('ltr'));
  app.mount('#app');
  (window as any).filterFixture = { state, filter, list, fyo };
}

/** Match a stored status the way the server's SQL filter does. */
function matchesStatus(status: string, filters: Filter[]) {
  return filters
    .filter((filter) => filter[0] === 'status')
    .every(([, operator, value]) =>
      matchesCondition(status, String(operator), String(value))
    );
}

function matchesCondition(status: string, operator: string, value: string) {
  const pattern = new RegExp(`^${value.replaceAll('%', '.*')}$`, 'i');
  switch (operator) {
    case '=':
      return status === value;
    case '!=':
      return status !== value;
    case 'like':
      return pattern.test(status);
    case 'not like':
      return !pattern.test(status);
    case '>':
      return status > value;
    case '<':
      return status < value;
    case 'is':
      return value === 'set' ? !!status : !status;
  }
  throw new Error(`Unsupported status filter: ${operator}`);
}

void mount();

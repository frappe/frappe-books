import { createApp, h, reactive, ref } from 'vue';
import { FrappeUI, FrappeUIProvider } from 'frappe-ui';
import type { DocValueMap } from 'fyo/core/types';
import { chunk } from 'lodash';
import { fyo } from 'src/initFyo';
// Load the router before the controls that import it, as the app does.
import 'src/router';
import List from 'src/pages/ListView/List.vue';
import FilterDropdown from 'src/components/FilterDropdown.vue';
import { models } from 'models';
import { FrappeDatabaseDemux } from 'src/web/databaseDemux';
import { languageDirectionKey } from 'src/utils/injectionKeys';
import type { QueryFilter } from 'utils/db/types';
import 'src/styles/index.css';
import { getTestSchemas } from './schemas';

async function mount() {
  FrappeDatabaseDemux.prototype.getSchemaMap = async () => {
    const schemas = getTestSchemas();
    return {
      ...schemas,
      Item: {
        ...schemas.Item,
        fields: [
          ...schemas.Item.fields,
          {
            fieldname: 'customChoice',
            fieldtype: 'Select',
            label: 'Custom Choice',
            filter: true,
            readOnly: true,
            required: true,
            default: 'code-one',
            options: [
              { label: 'First label', value: 'code-one' },
              { label: 'Second label', value: 'code-two' },
            ],
          },
          {
            fieldname: 'customSuggestion',
            fieldtype: 'AutoComplete',
            label: 'Custom Suggestion',
            options: [
              { label: 'One', value: 'One' },
              { label: 'Two', value: 'Two' },
            ],
          },
        ],
      },
    };
  };
  await fyo.db.init();
  fyo.doc.registerModels(models);
  fyo.singles.SystemSettings = { currency: 'USD', displayPrecision: 2 } as any;
  const state = reactive({
    applied: {} as QueryFilter,
    schemaName: 'SalesInvoice',
    useDatabase: false,
    lookupFailure: false,
    lookupCalls: [] as string[],
  });
  const invoices = Array.from({ length: 60 }, (_, index) => ({
    name: `INV-${index + 1}`,
    party: 'Test customer',
    date: '2024-01-01',
    submitted: true,
    cancelled: false,
    grandTotal: fyo.pesa(100),
    baseGrandTotal: fyo.pesa(100),
    status: ['Paid', 'Partly Paid', 'Unpaid'][index % 3],
  }));
  const fetchRows = async (filters: QueryFilter): Promise<DocValueMap[]> => {
    if (!state.useDatabase)
      return invoices.filter((row) => matchesStatus(row.status, filters));
    const response = await fetch('/__filter_database_test', {
      method: 'POST',
      body: JSON.stringify(filters),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  };
  // A list load asks for its page and its count; answer both from one query.
  let lastQuery = { key: '', rows: Promise.resolve([] as DocValueMap[]) };
  const queryRows = (schemaName: string, filters: QueryFilter = {}) => {
    const key = JSON.stringify([schemaName, state.useDatabase, filters]);
    if (key !== lastQuery.key) lastQuery = { key, rows: fetchRows(filters) };
    return lastQuery.rows;
  };
  const list = ref<InstanceType<typeof List>>();
  const lookupRows = (schemaName: string) => {
    state.lookupCalls.push(schemaName);
    if (state.lookupFailure) throw new Error('Lookup unavailable');
    if (schemaName === 'User')
      return [{ name: 'Administrator' }, { name: 'Guest' }];
    return schemaName === 'NumberSeries'
      ? [{ name: 'JV-' }, { name: 'BANK-' }]
      : [{ name: `${schemaName}-001` }, { name: `${schemaName}-002` }];
  };
  // The server's link search matches the typed letters in order.
  fyo.db.searchLink = async (schemaName, text) => {
    const letters = [...text.toLowerCase()].map((letter) =>
      letter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    const pattern = new RegExp(letters.join('.*'));
    return lookupRows(schemaName).filter(({ name }) =>
      pattern.test(name.toLowerCase())
    );
  };
  fyo.db.getAll = async (_schema, options = {}) => {
    if (options.fields?.[0] !== '*') return lookupRows(_schema);
    const rows = await queryRows(_schema, options.filters);
    const start = options.offset ?? 0;
    return rows.slice(start, options.limit ? start + options.limit : undefined);
  };
  fyo.db.count = async (schemaName, options = {}) =>
    (await queryRows(schemaName, options.filters)).length;
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
                    onChange: (query: QueryFilter) => {
                      state.applied = query;
                      void list.value?.updateData(query);
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
function matchesStatus(status: string, filters: QueryFilter) {
  const filter = filters.status ?? [];
  const conditions = Array.isArray(filter) ? filter : ['=', filter];
  return chunk(conditions, 2).every(([operator, value]) =>
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
    case 'is null':
      return !status;
    case 'is not null':
      return !!status;
  }
  throw new Error(`Unsupported status filter: ${operator}`);
}

void mount();

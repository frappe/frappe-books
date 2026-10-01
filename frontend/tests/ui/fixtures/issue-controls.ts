import { fyo } from 'src/initFyo';
import 'src/router';
import { createApp, h, reactive, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { FrappeUI, FrappeUIProvider } from 'frappe-ui';
import Attachment from 'src/components/Controls/Attachment.vue';
import Base from 'src/components/Controls/Base.vue';
import Check from 'src/components/Controls/Check.vue';
import Select from 'src/components/Controls/Select.vue';
import DateControl from 'src/components/Controls/Date.vue';
import Link from 'src/components/Controls/Link.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { languageDirectionKey } from 'src/utils/injectionKeys';
import { showSidebar } from 'src/utils/refs';
import 'src/styles/index.css';
import { loadFrappeFixture } from './frappe';

async function mount() {
  // Every link search and list finds the Cash account.
  await loadFrappeFixture(() => ({
    message: [{ name: 'Cash' }],
    data: [{ name: 'Cash' }],
  }));
  fyo.singles.SystemSettings = { date_format: 'MMM d, y' } as any;
  showSidebar.value = false;
  const state = reactive({
    text: '',
    checked: false,
    selected: 'First',
    date: '',
    account: '',
    attachment: null as string | null,
  });
  const app = createApp({
    render() {
      return h(
        FrappeUIProvider,
        {},
        {
          default: () => [
            h(PageHeader, { title: 'Issue controls' }),
            h('button', { id: 'before', type: 'button' }, 'Before fields'),
            h(
              'div',
              {
                style:
                  'width: 300px; height: 230px; overflow: hidden; margin: 20px;',
              },
              [
                h(Base, {
                  df: {
                    fieldtype: 'Data',
                    fieldname: 'description',
                    label: 'Description',
                  },
                  value: state.text,
                  onChange: (value: string) => (state.text = value),
                }),
                h(Check, {
                  df: {
                    fieldtype: 'Check',
                    fieldname: 'trackItem',
                    label: 'Track item',
                  },
                  value: state.checked,
                  onChange: (value: boolean) => (state.checked = value),
                }),
                h(Select, {
                  df: {
                    fieldtype: 'Select',
                    fieldname: 'method',
                    label: 'Payment method',
                    options: ['First', 'Second', 'Third'].map((value) => ({
                      label: value,
                      value,
                    })),
                  },
                  value: state.selected,
                  onChange: (value: string) => (state.selected = value),
                }),
                h(DateControl, {
                  df: {
                    fieldtype: 'Date',
                    fieldname: 'date',
                    label: 'Posting date',
                  },
                  value: state.date,
                  onChange: (value: string) => (state.date = value),
                }),
                h(Link, {
                  df: {
                    fieldtype: 'Link',
                    fieldname: 'account',
                    label: 'Account',
                    target: 'Account',
                  },
                  value: state.account,
                  onChange: (value: string) => (state.account = value),
                }),
              ]
            ),
            h('button', { id: 'after', type: 'button' }, 'After fields'),
            h(Attachment, {
              df: {
                fieldtype: 'Attachment',
                fieldname: 'attachment',
                label: 'Bill',
              },
              value: state.attachment,
              onChange: (value: string | null) => (state.attachment = value),
            }),
          ],
        }
      );
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
  (window as any).issueFixture = { state, showSidebar };
}

void mount();

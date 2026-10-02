import ChartOfAccounts from 'src/pages/ChartOfAccounts.vue';
import CommonForm from 'src/pages/CommonForm/CommonForm.vue';
import Dashboard from 'src/pages/Dashboard/Dashboard.vue';
import GetStarted from 'src/pages/GetStarted.vue';
import MobileSearch from 'src/mobile/search/MobileSearch.vue';
import ImportWizard from 'src/pages/ImportWizard.vue';
import ListView from 'src/pages/ListView/ListView.vue';
import PrintView from 'src/pages/PrintView/PrintView.vue';
import ReportPrintView from 'src/pages/PrintView/ReportPrintView.vue';
import QuickEditForm from 'src/pages/QuickEditForm.vue';
import Report from 'src/pages/Report.vue';
import Settings from 'src/pages/Settings/Settings.vue';
import TemplateBuilder from 'src/pages/TemplateBuilder/TemplateBuilder.vue';
import { t } from 'fyo';
import POS from 'src/pages/POS/POS.vue';
import type { HistoryState, RouteLocationNormalized } from 'vue-router';
import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { isDesktopOnly } from './mobile/availability';
import { historyState, settingsDialog } from './utils/refs';
import { isMobile } from './utils/viewport';

declare module 'vue-router' {
  interface RouteMeta {
    sidebarPath?: string;
    /** Left out of the phone layout. */
    desktopOnly?: boolean;
    /** Phones show a back button instead of the menu, and no tabs. */
    pushed?: boolean;
    /** Left out of the desktop layout. */
    phoneOnly?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: Dashboard,
  },
  {
    path: '/get-started',
    meta: { desktopOnly: true },
    component: GetStarted,
  },
  {
    path: `/edit/:schemaName/:name`,
    name: `CommonForm`,
    meta: { sidebarPath: '/list/:schemaName', pushed: true },
    components: {
      default: CommonForm,
      edit: QuickEditForm,
    },
    props: {
      default: (route) => ({
        schemaName: route.params.schemaName,
        name: route.params.name,
      }),
      edit: (route) => route.query,
    },
  },
  {
    path: '/list/:schemaName/:pageTitle?',
    name: 'ListView',
    components: {
      default: ListView,
      edit: QuickEditForm,
    },
    props: {
      default: (route) => {
        const { schemaName } = route.params;
        const pageTitle = route.params.pageTitle ?? '';

        // Frappe filters, as JSON.
        const filterString = route.query.filters;
        const filters =
          typeof filterString === 'string' ? JSON.parse(filterString) : [];

        return {
          schemaName,
          filters,
          pageTitle,
        };
      },
      edit: (route) => route.query,
    },
  },
  {
    path: '/print/:schemaName/:name',
    name: 'PrintView',
    meta: { sidebarPath: '/list/:schemaName', pushed: true },
    component: PrintView,
    props: true,
  },
  {
    path: '/report-print/:reportName',
    name: 'ReportPrintView',
    meta: { sidebarPath: '/report/:reportName', pushed: true },
    component: ReportPrintView,
    props: true,
  },
  {
    path: '/report/:reportClassName',
    name: 'Report',
    component: Report,
    props: true,
  },
  {
    path: '/chart-of-accounts',
    name: 'Chart Of Accounts',
    meta: { desktopOnly: true },
    components: {
      default: ChartOfAccounts,
      edit: QuickEditForm,
    },
    props: {
      default: true,
      edit: (route) => route.query,
    },
  },
  {
    path: '/import-wizard',
    name: 'Import Wizard',
    meta: { desktopOnly: true },
    component: ImportWizard,
  },
  {
    path: '/template-builder/:name',
    name: 'Template Builder',
    meta: { sidebarPath: '/list/PrintFormat', desktopOnly: true },
    component: TemplateBuilder,
    props: true,
  },
  {
    path: '/customize-form',
    name: 'Customize Form',
    redirect: () => ({
      name: 'ListView',
      params: { schemaName: 'CustomForm', pageTitle: t`Customize Form` },
    }),
  },
  {
    path: '/settings',
    name: 'Settings',
    meta: { phoneOnly: true },
    components: {
      default: Settings,
      edit: QuickEditForm,
    },
    props: {
      default: true,
      edit: (route) => route.query,
    },
  },
  {
    path: '/search',
    name: 'Search',
    meta: { phoneOnly: true },
    component: MobileSearch,
  },
  {
    path: '/pos',
    name: 'Point of Sale',
    meta: { pushed: true },
    components: {
      default: POS,
      edit: QuickEditForm,
    },
    props: {
      default: true,
      edit: (route) => route.query,
    },
  },
];

const router = createRouter({
  routes,
  history: createWebHistory(import.meta.env.VITE_ROUTER_BASE || '/'),
});

router.beforeEach((to, from) => {
  // SettingsDialog doesn't fit phones yet (frappe/frappe-ui#1244).
  if (to.name === 'Settings' && !isMobile.value) {
    return openSettingsDialog(to, from);
  }

  if (isMobile.value ? isDesktopOnly(to) : to.meta.phoneOnly) {
    return '/';
  }
});

router.afterEach(() => {
  const state = history.state as HistoryState;
  historyState.forward = !!state.forward;
  historyState.back = !!state.back;
});

/** Opens over the current page, or over the dashboard on a cold load. */
function openSettingsDialog(
  to: RouteLocationNormalized,
  from: RouteLocationNormalized
) {
  const { tab } = to.query;
  if (typeof tab === 'string') {
    settingsDialog.tab = tab;
  }

  settingsDialog.open = true;
  return from.matched.length ? false : '/';
}

export default router;

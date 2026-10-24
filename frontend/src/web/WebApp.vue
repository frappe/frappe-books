<template>
  <FrappeUIProvider>
    <div
      id="books-app"
      class="h-screen flex flex-col overflow-hidden bg-surface-base antialiased"
      :dir="languageDirection"
    >
      <div
        v-if="loading"
        class="h-full flex items-center justify-center bg-surface-gray-1"
      >
        <FrappeAlert
          v-if="startupError"
          class="max-w-xl"
          theme="red"
          :title="t`Books could not start`"
          :description="startupError"
          :primary-action="{ label: t`Try again`, onClick: () => initialize() }"
        />
        <FrappeSpinner v-else size="lg" />
      </div>
      <SetupWizard
        v-else-if="needsSetup"
        @setup-complete="completeSetup"
        @setup-canceled="leaveBooks"
      />
      <MobileDesk v-else-if="isMobile" />
      <Desk v-else class="flex-1" />
      <DialogSheet v-if="isMobile" />
    </div>
  </FrappeUIProvider>
</template>

<script lang="ts">
import type { FrappeDoc } from 'src/frappe/document';
import { frappeModels, getRegionalFrappeModels } from 'models';
import type { Company } from 'models/baseModels/Company/Company';
import type { SystemSettings } from 'models/baseModels/SystemSettings/SystemSettings';
import { ModelNameEnum } from 'models/types';
import DialogSheet from 'src/mobile/DialogSheet.vue';
import MobileDesk from 'src/mobile/MobileDesk.vue';
import Desk from 'src/pages/Desk.vue';
import SetupWizard from 'src/pages/SetupWizard/SetupWizard.vue';
import {
  getSchemaDoctypes,
  getSingleSchemaNames,
  loadFrappeDocTypes,
} from 'src/frappe/registry';
import type { DocValues } from 'src/frappe/api';
import { getDocType, registerFrappeModels } from 'src/frappe/doctypes';
import { getFrappeDoc, openFrappeDoc } from 'src/frappe/documents';
import { isAccessoryMode } from 'src/frappe/mode';
import { fyo } from 'src/initFyo';
import { Search } from 'src/utils/search';
import { Shortcuts } from 'src/utils/shortcuts';
import { deskTheme, getColorScheme } from 'src/utils/theme';
import { isMobile } from 'src/utils/viewport';
import { useKeys } from 'src/utils/vueUtils';
import * as injectionKeys from 'src/utils/injectionKeys';
import {
  defineComponent,
  onMounted,
  onUnmounted,
  provide,
  ref,
  shallowRef,
  watchEffect,
} from 'vue';
import {
  Alert as FrappeAlert,
  FrappeUIProvider,
  Spinner as FrappeSpinner,
  useColorScheme,
} from 'frappe-ui';
import { call, redirectToLogin } from './api';

export default defineComponent({
  name: 'WebApp',
  components: {
    FrappeAlert,
    Desk,
    DialogSheet,
    MobileDesk,
    FrappeSpinner,
    FrappeUIProvider,
    SetupWizard,
  },
  setup() {
    const keys = useKeys();
    const searcher = shallowRef<Search | null>(null);
    const shortcuts = new Shortcuts();
    onMounted(() => shortcuts.start());
    onUnmounted(() => shortcuts.stop());
    const languageDirection = ref(
      window.frappe.boot?.layout_direction ?? 'ltr'
    );
    provide(injectionKeys.keysKey, keys);
    provide(injectionKeys.searcherKey, searcher);
    provide(injectionKeys.shortcutsKey, shortcuts);
    provide(injectionKeys.languageDirectionKey, languageDirection);
    deskTheme.value = window.frappe.boot?.desk_theme ?? 'Light';
    const { setColorScheme } = useColorScheme();
    watchEffect(() => setColorScheme(getColorScheme(deskTheme.value)));
    return { keys, languageDirection, searcher, shortcuts, isMobile };
  },
  data() {
    return {
      loading: true,
      needsSetup: false,
      startupError: '',
    };
  },
  async mounted() {
    await this.initialize();
  },
  methods: {
    async initialize() {
      this.loading = true;
      this.startupError = '';
      try {
        await this.initializeBooks();
      } catch (error) {
        this.startupError =
          error instanceof Error ? error.message : String(error);
      }
    },
    async initializeBooks() {
      const boot = window.frappe.boot || {};
      if (!boot.user?.name || boot.user.name === 'Guest') {
        redirectToLogin();
        return;
      }
      const books = boot.books!;
      fyo.store.isDevelopment = !!boot.developer_mode;
      fyo.store.appVersion = boot.versions?.frappe_books ?? '';
      fyo.store.chartsOfAccounts = books.charts_of_accounts;
      fyo.store.indianStates = books.indian_states;
      fyo.setCurrencySymbols(boot.docs);
      fyo.user = boot.user.name;

      registerFrappeModels(frappeModels);
      registerFrappeModels(await getRegionalFrappeModels(books.country_code));
      fyo.store.permissions = {
        doctypes: getSchemaDoctypes(),
        user: boot.user,
      };
      await loadFrappeDocTypes();
      const sent = await getUISettings();
      // Amounts load in the currency and precision the system settings set.
      const systemSettings = ModelNameEnum.SystemSettings;
      fyo.initializeMoneyMaker(
        (await loadSingle(systemSettings, sent)) as SystemSettings
      );
      // Some singles, like the ERPNext settings, are only for some roles.
      const singles = getSingleSchemaNames().filter(
        (name) =>
          name !== ModelNameEnum.SetupWizard &&
          name !== systemSettings &&
          (fyo.can(name, 'read') || sent[getDocType(name).doctype])
      );
      await Promise.all([
        ...singles.map((name) => loadSingle(name, sent)),
        loadCompany(books.company),
      ]);
      // ERPNext's setup wizard sets up accessory mode.
      this.needsSetup =
        !isAccessoryMode() && !fyo.singles.AccountingSettings?.setup_complete;
      if (!this.needsSetup) {
        this.searcher = new Search(fyo);
        this.searcher.initialize();
      }
      this.loading = false;
    },
    async completeSetup(wizard: FrappeDoc) {
      await wizard.sync();
      await call(
        'frappe_books.frappe_books.doctype.books_setup_wizard.books_setup_wizard.complete_setup'
      );
      window.location.reload();
    },
    leaveBooks() {
      window.location.href = '/app';
    },
  },
});

/**
 * Books' UI settings by doctype, which accessory mode sends to users whose
 * ERPNext roles cannot read some of the singles.
 */
async function getUISettings(): Promise<Record<string, DocValues>> {
  const unreadable = getSingleSchemaNames().some(
    (name) => !fyo.can(name, 'read')
  );
  if (!isAccessoryMode() || !unreadable) {
    return {};
  }

  return await call<Record<string, DocValues>>(
    'frappe_books.accessory.ui_settings.get_ui_settings'
  );
}

/** A single as saved: loaded, or from the values sent when the user cannot read it. */
async function loadSingle(
  name: string,
  sent: Record<string, DocValues>
): Promise<FrappeDoc> {
  const values = fyo.can(name, 'read')
    ? undefined
    : sent[getDocType(name).doctype];
  return values
    ? await openFrappeDoc(name, values)
    : await getFrappeDoc(name, name);
}

/** The one company is read from `fyo.singles`, as the settings are. */
async function loadCompany(name: string | null) {
  if (name) {
    fyo.singles.Company = (await getFrappeDoc(
      ModelNameEnum.Company,
      name
    )) as Company;
  }
}
</script>

<style>
@import '../styles/index.css';

html,
body,
#app,
#books-app {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>

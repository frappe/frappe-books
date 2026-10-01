<template>
  <FrappeUIProvider>
    <div
      id="books-app"
      class="
        h-screen
        flex flex-col
        overflow-hidden
        bg-surface-base
        font-sans
        antialiased
      "
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
          title="Books could not start"
          :description="startupError"
          :primary-action="{ label: 'Try again', onClick: () => initialize() }"
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
import type { SystemSettings } from 'models/baseModels/SystemSettings/SystemSettings';
import { ModelNameEnum } from 'models/types';
import DialogSheet from 'src/mobile/DialogSheet.vue';
import MobileDesk from 'src/mobile/MobileDesk.vue';
import Desk from 'src/pages/Desk.vue';
import SetupWizard from 'src/pages/SetupWizard/SetupWizard.vue';
import { registerFrappeModels } from 'src/frappe/doctypes';
import {
  getSchemaDoctypes,
  getSingleSchemaNames,
  loadFrappeDocTypes,
} from 'src/frappe/registry';
import { getFrappeDoc } from 'src/frappe/documents';
import { fyo } from 'src/initFyo';
import { Search } from 'src/utils/search';
import { Shortcuts } from 'src/utils/shortcuts';
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
      fyo.store.permissions = { doctypes: getSchemaDoctypes(), user: boot.user };
      await loadFrappeDocTypes();
      // Amounts load in the currency and precision the system settings set.
      const systemSettings = ModelNameEnum.SystemSettings;
      fyo.initializeMoneyMaker(
        (await getFrappeDoc(systemSettings, systemSettings)) as SystemSettings
      );
      const singles = getSingleSchemaNames().filter(
        (name) => name !== ModelNameEnum.SetupWizard && name !== systemSettings
      );
      await Promise.all(singles.map((name) => getFrappeDoc(name, name)));
      this.needsSetup = !fyo.singles.AccountingSettings?.setup_complete;
      useColorScheme().setColorScheme(
        fyo.singles.SystemSettings?.dark_mode ? 'dark' : 'light'
      );
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

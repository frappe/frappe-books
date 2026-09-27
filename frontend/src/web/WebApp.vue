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
      <MobileDesk v-else-if="isMobile" :dark-mode="darkMode" />
      <Desk v-else class="flex-1" :dark-mode="darkMode" />
    </div>
  </FrappeUIProvider>
</template>

<script lang="ts">
import type { DocValueMap } from 'fyo/core/types';
import { RTL_LANGUAGES } from 'fyo/utils/consts';
import { models, getRegionalModels } from 'models';
import { ModelNameEnum } from 'models/types';
import MobileDesk from 'src/mobile/MobileDesk.vue';
import Desk from 'src/pages/Desk.vue';
import SetupWizard from 'src/pages/SetupWizard/SetupWizard.vue';
import { fyo } from 'src/initFyo';
import { Search } from 'src/utils/search';
import { Shortcuts } from 'src/utils/shortcuts';
import { setDarkMode } from 'src/utils/theme';
import { systemLanguageRef } from 'src/utils/refs';
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
} from 'frappe-ui';
import { call } from './api';

export default defineComponent({
  name: 'WebApp',
  components: {
    FrappeAlert,
    Desk,
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
      getLanguageDirection(systemLanguageRef.value)
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
      darkMode: false,
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
        window.location.href = `/login?redirect-to=${encodeURIComponent(
          '/books'
        )}`;
        return;
      }
      const books = boot.books!;
      fyo.store.isDevelopment = !!boot.developer_mode;
      fyo.store.appVersion = boot.versions?.frappe_books ?? '';
      fyo.store.permissions = { doctypes: books.doctypes, user: boot.user };
      fyo.store.searchFields = books.search_fields;
      fyo.store.chartsOfAccounts = books.charts_of_accounts;
      fyo.store.accountLabels = books.account_labels;
      fyo.store.indianStates = books.indian_states;
      fyo.store.language = boot.lang || 'English';
      fyo.user = boot.user.name;

      const countryCode = books.country_code || '-';
      await fyo.db.connect(countryCode);
      await fyo.initializeAndRegister(
        models,
        await getRegionalModels(countryCode)
      );
      const singles = Object.values(fyo.schemaMap).filter(
        (schema) => schema?.isSingle && schema.name !== 'SetupWizard'
      );
      await Promise.all([
        fyo.loadCurrencySymbols(),
        fyo.loadDefaultNumberSeries(),
        ...singles.map((schema) => fyo.doc.getDoc(schema!.name)),
      ]);
      this.needsSetup = !fyo.singles.AccountingSettings?.setupComplete;
      this.darkMode = Boolean(fyo.singles.SystemSettings?.darkMode);
      setDarkMode(this.darkMode);
      if (!this.needsSetup) {
        this.searcher = new Search(fyo);
        this.searcher.initialize();
      }
      this.loading = false;
    },
    async completeSetup(values: DocValueMap) {
      await fyo.db.insert(ModelNameEnum.SetupWizard, values);
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

function getLanguageDirection(language: string): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
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

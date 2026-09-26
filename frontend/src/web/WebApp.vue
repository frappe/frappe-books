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
        <div v-if="startupError" class="max-w-xl p-8 text-center">
          <h1 class="text-xl font-semibold text-ink-gray-9">
            Books could not start
          </h1>
          <p class="mt-3 text-sm text-ink-gray-7">{{ startupError }}</p>
          <FrappeButton class="mt-5" theme="blue" @click="initialize">
            Try again
          </FrappeButton>
        </div>
        <FrappeSpinner v-else size="lg" />
      </div>
      <SetupWizard
        v-else-if="needsSetup"
        @setup-complete="completeSetup"
        @setup-canceled="leaveBooks"
      />
      <Desk v-else class="flex-1" :dark-mode="darkMode" />
    </div>
  </FrappeUIProvider>
</template>

<script lang="ts">
import { RTL_LANGUAGES } from 'fyo/utils/consts';
import { models, getRegionalModels } from 'models';
import Desk from 'src/pages/Desk.vue';
import SetupWizard from 'src/pages/SetupWizard/SetupWizard.vue';
import { fyo } from 'src/initFyo';
import { Search } from 'src/utils/search';
import { Shortcuts } from 'src/utils/shortcuts';
import { setDarkMode } from 'src/utils/theme';
import { systemLanguageRef } from 'src/utils/refs';
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
  Button as FrappeButton,
  FrappeUIProvider,
  Spinner as FrappeSpinner,
} from 'frappe-ui';
import { call } from './api';

export default defineComponent({
  name: 'WebApp',
  components: {
    Desk,
    FrappeButton,
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
    return { keys, languageDirection, searcher, shortcuts };
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
      fyo.store.isDevelopment = window.books_boot.developer_mode;
      fyo.store.appVersion = window.books_boot.app_version;
      fyo.store.language = boot.lang || 'English';
      fyo.user = boot.user.name;

      const countryCode = window.books_boot.country_code || '-';
      await fyo.db.connect(countryCode);
      await fyo.initializeAndRegister(
        models,
        await getRegionalModels(countryCode)
      );
      for (const schema of Object.values(fyo.schemaMap)) {
        if (schema?.isSingle && schema.name !== 'SetupWizard') {
          await fyo.doc.getDoc(schema.name);
        }
      }
      this.needsSetup = !fyo.singles.AccountingSettings?.setupComplete;
      this.darkMode = Boolean(fyo.singles.SystemSettings?.darkMode);
      setDarkMode(this.darkMode);
      if (!this.needsSetup) {
        this.searcher = new Search(fyo);
        await this.searcher.initializeKeywords();
      }
      this.loading = false;
    },
    async completeSetup(options: Record<string, unknown>) {
      await call('frappe_books.ui_api.complete_setup', { options });
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

.books-modal {
  max-height: calc(100vh - 5rem);
  max-height: calc(100dvh - 5rem);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: #d1d8dd transparent;
  scrollbar-gutter: stable both-edges;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

.books-modal::-webkit-scrollbar {
  display: block;
  width: 0.375rem;
}

.books-modal::-webkit-scrollbar-thumb {
  background: #d1d8dd;
  border-radius: 9999px;
}

.dark .books-modal {
  scrollbar-color: #525252 transparent;
}

.dark .books-modal::-webkit-scrollbar-thumb {
  background: #525252;
}
</style>

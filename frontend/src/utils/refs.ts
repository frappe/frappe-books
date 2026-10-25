import { useLocalStorage } from '@vueuse/core';
import { ModelNameEnum } from 'models/types';
import { reactive, ref } from 'vue';
import type { HistoryState } from 'vue-router';

export const showSidebar = ref(true);
/** The desktop sidebar's width in pixels, as the user last dragged it in this browser. */
export const sidebarWidth = useLocalStorage('books-sidebar-width', 224);
export const docsPathRef = ref<string>('');
export const historyState = reactive({
  forward: !!(history.state as HistoryState)?.forward,
  back: !!(history.state as HistoryState)?.back,
});

/** Desktop settings show in a dialog over the page; phones open a page. */
export const settingsDialog = reactive({
  open: false,
  tab: ModelNameEnum.AccountingSettings as string,
});

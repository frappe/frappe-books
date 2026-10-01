import { mobileFooterKey } from 'src/utils/injectionKeys';
import { computed, provide, reactive, ref } from 'vue';

/** Hosts the footers phone pages pin in place of the bottom tabs. */
export function provideMobileFooter() {
  const target = ref<HTMLElement | null>(null);
  const owners = reactive(new Set<symbol>());
  provide(mobileFooterKey, { target, owners });
  return { target, hasFooter: computed(() => owners.size > 0) };
}

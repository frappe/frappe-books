import type { InjectionKey, Ref } from 'vue';
import type { Search } from './search';
import type { Shortcuts } from './shortcuts';
import type { useKeys } from './vueUtils';

export const languageDirectionKey = Symbol('languageDirection') as InjectionKey<
  Ref<'ltr' | 'rtl'>
>;

export const keysKey = Symbol('keys') as InjectionKey<
  ReturnType<typeof useKeys>
>;

export const searcherKey = Symbol('searcher') as InjectionKey<
  Ref<null | Search>
>;

export const shortcutsKey = Symbol('shortcuts') as InjectionKey<Shortcuts>;

export const openNavSheetKey = Symbol('openNavSheet') as InjectionKey<
  () => void
>;

/** Where phone pages pin their footer, and which pages show one. */
export const mobileFooterKey = Symbol('mobileFooter') as InjectionKey<{
  target: Readonly<Ref<HTMLElement | null>>;
  owners: Set<symbol>;
}>;

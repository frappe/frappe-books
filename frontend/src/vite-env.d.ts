/// <reference types="vite/client" />

declare module '~icons/*' {
  import type { DefineComponent } from 'vue';

  const icon: DefineComponent;
  export default icon;
}

declare module 'frappe-ui/vite/lucideIconsPlugin' {
  import type { Plugin } from 'vite';

  export function lucideIconsPlugin(): Plugin;
}

interface ImportMetaEnv {
  readonly VITE_ROUTER_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

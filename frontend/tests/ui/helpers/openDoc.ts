import type { Page } from '@playwright/test';

/**
 * Keeps the open document of `schemaName` as `window.openDoc`. Frappe-backed
 * documents live in the app's own registry, which only mounted components
 * reach, so this finds the first component that shows one.
 */
export async function holdOpenDoc(page: Page, schemaName: string) {
  await page.waitForFunction((schemaName) => {
    const seen = new Set<unknown>();
    const find = (vnode: any): any => {
      if (!vnode || typeof vnode !== 'object' || seen.has(vnode)) {
        return undefined;
      }

      seen.add(vnode);
      const doc = vnode.component?.props?.doc;
      if (doc?.schemaName === schemaName) {
        return doc;
      }

      const children = [
        vnode.component?.subTree,
        vnode.suspense?.activeBranch,
        ...(Array.isArray(vnode.children) ? vnode.children : []),
      ];
      for (const child of children) {
        const found = find(child);
        if (found) {
          return found;
        }
      }

      return undefined;
    };
    const doc = find((document.querySelector('#app') as any)?._vnode);
    (window as any).openDoc = doc;
    return !!doc;
  }, schemaName);
}

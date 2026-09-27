<template>
  <FrappePageHeaderMobile v-if="isActive && isMobile" :title="title">
    <template #prefix>
      <FrappePageHeaderBackButton
        v-if="$route.meta.pushed"
        class="rtl-rotate-180"
        :label="t`Back`"
        fallback-route="/"
      />
      <FrappeButton
        v-else
        variant="ghost"
        icon="lucide-menu"
        :label="t`Menu`"
        @click="openDrawer?.()"
      />
    </template>
    <template v-if="$slots.mobile" #suffix>
      <div class="flex items-center gap-1">
        <slot name="mobile" />
      </div>
    </template>
  </FrappePageHeaderMobile>
  <FrappePageHeader
    v-else-if="isActive"
    class="w-full min-w-0 flex-shrink-0"
    :class="border ? '' : '!border-b-0'"
  >
    <div class="me-auto flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
      <FrappeButton
        v-if="!showSidebar"
        variant="ghost"
        icon="lucide-chevrons-right"
        class="rtl-rotate-180"
        :label="t`Show sidebar`"
        :tooltip="t`Show sidebar`"
        @click="toggleSidebar"
      />

      <PageHeaderNavGroup />
      <h1 v-if="title" class="min-w-0">
        <FrappePageHeaderTitle :title="title" class="block select-none" />
      </h1>

      <div class="flex min-w-0 items-stretch gap-3">
        <slot name="left" />
      </div>
    </div>

    <div class="ms-auto flex flex-shrink-0 items-stretch gap-2">
      <slot />
    </div>
  </FrappePageHeader>
</template>
<script lang="ts">
import {
  PageHeader as FrappePageHeader,
  PageHeaderBackButton as FrappePageHeaderBackButton,
  PageHeaderMobile as FrappePageHeaderMobile,
  PageHeaderTitle as FrappePageHeaderTitle,
  Button as FrappeButton,
} from 'frappe-ui';
import { openDrawerKey } from 'src/utils/injectionKeys';
import { showSidebar } from 'src/utils/refs';
import { toggleSidebar } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { defineComponent, inject, onActivated, onDeactivated, ref } from 'vue';
import PageHeaderNavGroup from './PageHeaderNavGroup.vue';

export default defineComponent({
  components: {
    FrappeButton,
    FrappePageHeader,
    FrappePageHeaderBackButton,
    FrappePageHeaderMobile,
    FrappePageHeaderTitle,
    PageHeaderNavGroup,
  },
  props: {
    title: { type: String, default: '' },
    border: { type: Boolean, default: true },
  },
  setup() {
    // A teleported header stays in the shell when keep-alive caches its page.
    const isActive = ref(true);
    onActivated(() => (isActive.value = true));
    onDeactivated(() => (isActive.value = false));
    const openDrawer = inject(openDrawerKey, undefined);
    return { showSidebar, isActive, isMobile, openDrawer };
  },
  methods: { toggleSidebar },
});
</script>

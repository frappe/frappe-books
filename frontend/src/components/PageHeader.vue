<template>
  <FrappePageHeaderMobile v-if="isActive && isMobile" :title="title">
    <template #prefix>
      <slot name="mobile-prefix"><PageHeaderLead /></slot>
    </template>
    <template v-if="$slots['mobile-title']" #default>
      <slot name="mobile-title" />
    </template>
    <template v-if="$slots.mobile" #suffix>
      <div class="flex items-center gap-2">
        <slot name="mobile" />
      </div>
    </template>
  </FrappePageHeaderMobile>
  <FrappePageHeader v-else-if="isActive" class="w-full min-w-0 flex-shrink-0">
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

      <div class="flex min-w-0 items-center gap-3">
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
  PageHeaderMobile as FrappePageHeaderMobile,
  PageHeaderTitle as FrappePageHeaderTitle,
  Button as FrappeButton,
} from 'frappe-ui';
import { showSidebar } from 'src/utils/refs';
import { toggleSidebar } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { defineComponent, onActivated, onDeactivated, ref } from 'vue';
import PageHeaderLead from './PageHeaderLead.vue';
import PageHeaderNavGroup from './PageHeaderNavGroup.vue';

export default defineComponent({
  components: {
    FrappeButton,
    FrappePageHeader,
    FrappePageHeaderMobile,
    FrappePageHeaderTitle,
    PageHeaderLead,
    PageHeaderNavGroup,
  },
  props: {
    title: { type: String, default: '' },
  },
  setup() {
    // A teleported header stays in the shell when keep-alive caches its page.
    const isActive = ref(true);
    onActivated(() => (isActive.value = true));
    onDeactivated(() => (isActive.value = false));
    return { showSidebar, isActive, isMobile };
  },
  methods: { toggleSidebar },
});
</script>

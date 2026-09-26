<template>
  <FrappePageHeader
    v-if="isActive"
    class="w-full min-w-0 flex-shrink-0"
    :class="border ? '' : '!border-b-0'"
  >
    <div class="me-auto flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
      <Button
        v-if="!showSidebar"
        :background="false"
        :icon="true"
        :padding="false"
        class="!h-8 !w-8 !px-0 flex-shrink-0 rtl-rotate-180"
        :title="t`Show sidebar`"
        :aria-label="t`Show sidebar`"
        @click="toggleSidebar"
      >
        <Icon name="chevrons-right" class="h-4 w-4" />
      </Button>

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
  PageHeaderTitle as FrappePageHeaderTitle,
} from 'frappe-ui';
import { showSidebar } from 'src/utils/refs';
import { toggleSidebar } from 'src/utils/ui';
import { defineComponent, onActivated, onDeactivated, ref } from 'vue';
import Button from './Button.vue';
import Icon from './Icon.vue';
import PageHeaderNavGroup from './PageHeaderNavGroup.vue';

export default defineComponent({
  components: {
    Button,
    FrappePageHeader,
    FrappePageHeaderTitle,
    Icon,
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
    return { showSidebar, isActive };
  },
  methods: { toggleSidebar },
});
</script>

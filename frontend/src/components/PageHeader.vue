<template>
  <FrappePageHeader
    class="h-row-largest w-full min-w-0 flex-shrink-0 !px-4"
    :class="border ? '' : '!border-b-0'"
  >
    <div
      class="
        flex
        min-w-0
        flex-1
        items-center
        gap-4
        me-auto
        overflow-hidden
      "
    >
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

      <!-- Nav Group -->
      <PageHeaderNavGroup />
      <h1
        v-if="title"
        class="text-xl font-semibold select-none truncate text-ink-gray-9"
      >
        {{ title }}
      </h1>

      <!-- Left Slot -->
      <div class="flex min-w-0 items-stretch gap-4">
        <slot name="left" />
      </div>
    </div>

    <!-- Right (regular) Slot -->
    <div class="flex flex-shrink-0 items-stretch gap-2 ms-auto">
      <slot />
    </div>
  </FrappePageHeader>
</template>
<script lang="ts">
import { PageHeader as FrappePageHeader } from 'frappe-ui';
import { showSidebar } from 'src/utils/refs';
import { toggleSidebar } from 'src/utils/ui';
import { defineComponent } from 'vue';
import Button from './Button.vue';
import Icon from './Icon.vue';
import PageHeaderNavGroup from './PageHeaderNavGroup.vue';

export default defineComponent({
  components: { Button, FrappePageHeader, Icon, PageHeaderNavGroup },
  props: {
    title: { type: String, default: '' },
    border: { type: Boolean, default: true },
    searchborder: { type: Boolean, default: true },
  },
  setup() {
    return { showSidebar };
  },
  methods: { toggleSidebar },
  computed: {
    showBorder() {
      return !!this.$slots.default && this.searchborder;
    },
  },
});
</script>

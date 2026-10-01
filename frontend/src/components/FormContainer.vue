<template>
  <div
    class="
      flex
      h-full
      min-h-0
      min-w-0
      w-full
      bg-surface-gray-1
      overflow-x-auto
    "
  >
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Page Header (Title, Buttons, etc) -->
      <PageHeader
        v-if="showHeader"
        :title="title"
        :border="false"
      >
        <template #left>
          <slot name="header-left" />
        </template>
        <slot name="header" />
      </PageHeader>

      <!-- Common Form -->
      <div
        class="
          flex flex-col
          self-center
          flex-1
          min-h-0
          overflow-auto
          bg-surface-base
        "
        :class="
          useFullWidth
            ? 'w-full border-t border-outline-gray-1'
            : 'w-form border border-outline-gray-1 rounded-6 shadow-lg m-4'
        "
      >
        <slot name="body" />
      </div>
    </div>

    <!-- Invoice Quick Edit -->
    <slot name="quickedit" />
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue';
import PageHeader from './PageHeader.vue';

export default defineComponent({
  components: { PageHeader },
  props: {
    title: { type: String, default: '' },
    useFullWidth: { type: Boolean, default: false },
    showHeader: { type: Boolean, default: true },
  },
});
</script>

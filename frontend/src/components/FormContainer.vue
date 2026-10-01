<template>
  <div class="flex h-full min-h-0 w-full min-w-0 overflow-x-auto">
    <div class="flex min-w-0 flex-1 flex-col">
      <slot name="header" />
      <FrappeScrollArea class="min-h-0 flex-1" viewport-class="pb-10">
        <div :class="columnClasses">
          <slot name="body" />
        </div>
      </FrappeScrollArea>
      <div
        v-if="$slots.footer"
        class="shrink-0 border-t border-outline-gray-1 py-4"
      >
        <div :class="columnClasses">
          <slot name="footer" />
        </div>
      </div>
    </div>

    <!-- Side panels: quick edit, row editor, linked entries -->
    <slot name="quickedit" />
  </div>
</template>
<script lang="ts">
import { ScrollArea as FrappeScrollArea } from 'frappe-ui';
import { defineComponent } from 'vue';

export default defineComponent({
  components: { FrappeScrollArea },
  props: { useFullWidth: Boolean },
  computed: {
    /** Full width lifts the reading-width cap. */
    columnClasses(): string[] {
      return [
        'mx-auto w-full px-3 sm:px-5',
        this.useFullWidth ? '' : 'max-w-[940px]',
      ];
    },
  },
});
</script>

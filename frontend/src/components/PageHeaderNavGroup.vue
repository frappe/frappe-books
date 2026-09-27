<template>
  <div class="flex">
    <SearchBar />
    <!-- Back Button -->
    <FrappeButton
      icon="lucide-chevron-left"
      variant="subtle"
    class="rounded-none border-x border-outline-gray-1"
      :disabled="!historyState.back"
      :tooltip="t`Back`"
      :aria-label="t`Back`"
      @click="$router.back()"
    />
    <!-- Forward Button -->
    <FrappeButton
      icon="lucide-chevron-right"
      variant="subtle"
    class="rounded-s-none"
      :disabled="!historyState.forward"
      :tooltip="t`Forward`"
      :aria-label="t`Forward`"
      @click="$router.forward()"
    />
  </div>
</template>
<script lang="ts">
import { shortcutsKey } from 'src/utils/injectionKeys';
import { Button as FrappeButton } from 'frappe-ui';
import { inject } from 'vue';
import { defineComponent } from 'vue';
import SearchBar from './SearchBar.vue';
import { historyState } from 'src/utils/refs';

const COMPONENT_NAME = 'PageHeaderNavGroup';

export default defineComponent({
  components: { SearchBar, FrappeButton },
  setup() {
    return {
      historyState,
      shortcuts: inject(shortcutsKey),
    };
  },
  computed: {
    hasBack() {
      return !!history.back;
    },
    hasForward() {
      return !!history.forward;
    },
  },
  activated() {
    this.shortcuts?.shift.set(COMPONENT_NAME, ['Backspace'], () => {
      if (this.historyState.back) {
        this.$router.back();
      }
    });
  },
  deactivated() {
    this.shortcuts?.delete(COMPONENT_NAME);
  },
});
</script>

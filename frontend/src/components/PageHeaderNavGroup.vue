<template>
  <div class="flex gap-1">
    <SearchBar />
    <!-- Back Button -->
    <FrappeButton
      icon="lucide-chevron-left"
      variant="ghost"
      :disabled="!historyState.back"
      :tooltip="t`Back`"
      :aria-label="t`Back`"
      @click="$router.back()"
    />
    <!-- Forward Button -->
    <FrappeButton
      icon="lucide-chevron-right"
      variant="ghost"
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
  // PageHeader mounts this only while its page is active, and each page has
  // its own copy, so the instance is the shortcut context.
  mounted() {
    this.shortcuts?.shift.set(this, ['Backspace'], () => {
      if (this.historyState.back) {
        this.$router.back();
      }
    });
  },
  unmounted() {
    this.shortcuts?.delete(this);
  },
});
</script>

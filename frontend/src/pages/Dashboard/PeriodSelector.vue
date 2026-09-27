<template>
  <template v-if="isMobile">
    <FrappeButton
      size="md"
      variant="subtle"
      icon-right="lucide-chevron-down"
      :label="periodSelectorMap[value]"
      @click="isSheetOpen = true"
    />
    <FrappeBottomSheet v-model:open="isSheetOpen" :title="t`Period`">
      <div
        role="listbox"
        :aria-label="t`Period`"
        class="flex flex-col px-2 pb-[max(env(safe-area-inset-bottom),1rem)]"
      >
        <button
          v-for="option in periodOptions"
          :key="option.value"
          type="button"
          role="option"
          :aria-selected="option.value === value"
          class="flex h-[52px] items-center gap-3 rounded-5 px-3 text-start text-lg text-ink-gray-8 active:bg-surface-gray-2"
          @click="pickOption(option.value)"
        >
          <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
          <FrappeIcon
            v-if="option.value === value"
            icon="lucide-check"
            class="size-[18px] text-ink-gray-9"
          />
        </button>
      </div>
    </FrappeBottomSheet>
  </template>
  <FrappeSelect
    v-else
    :model-value="value"
    :options="periodOptions"
    size="md"
    variant="subtle"
    side="bottom"
    align="end"
    @update:model-value="selectOption"
  />
</template>

<script lang="ts">
import { t } from 'fyo';
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
  Icon as FrappeIcon,
  Select as FrappeSelect,
} from 'frappe-ui';
import { PeriodKey } from 'src/utils/types';
import { isMobile } from 'src/utils/viewport';
import { PropType } from 'vue';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'PeriodSelector',
  components: {
    FrappeBottomSheet,
    FrappeButton,
    FrappeIcon,
    FrappeSelect,
  },
  props: {
    value: { type: String as PropType<PeriodKey>, default: 'This Year' },
    options: {
      type: Array as PropType<PeriodKey[]>,
      default: () => ['This Year', 'This Quarter', 'This Month', 'YTD'],
    },
  },
  emits: ['change'],
  setup() {
    return { isMobile };
  },
  data() {
    return { isSheetOpen: false };
  },
  computed: {
    periodSelectorMap(): Record<PeriodKey, string> {
      return {
        'This Year': t`This Year`,
        YTD: t`Year to Date`,
        'This Quarter': t`This Quarter`,
        'This Month': t`This Month`,
      };
    },
    periodOptions(): { label: string; value: PeriodKey }[] {
      return this.options.map((option) => ({
        label: this.periodSelectorMap[option],
        value: option,
      }));
    },
  },
  methods: {
    pickOption(period: PeriodKey) {
      this.isSheetOpen = false;
      this.selectOption(period);
    },
    selectOption(value?: string | number | null) {
      if (typeof value !== 'string') {
        return;
      }

      const period = value as PeriodKey;
      if (!this.options.includes(period)) {
        return;
      }

      this.$emit('change', period);
    },
  },
});
</script>

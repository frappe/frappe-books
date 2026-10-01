<template>
  <template v-if="isMobile">
    <FrappeButton
      size="md"
      variant="subtle"
      icon-right="lucide-chevron-down"
      :label="periodSelectorMap[value]"
      @click="isSheetOpen = true"
    />
    <MobileOptionsSheet
      v-model:open="isSheetOpen"
      :title="t`Period`"
      :options="periodOptions"
      :value="value"
      @select="selectOption"
    />
  </template>
  <FrappeSelect
    v-else
    :model-value="value"
    :options="periodOptions"
    side="bottom"
    align="end"
    @update:model-value="selectOption"
  />
</template>

<script lang="ts">
import { t } from 'fyo';
import { Button as FrappeButton, Select as FrappeSelect } from 'frappe-ui';
import MobileOptionsSheet from 'src/mobile/MobileOptionsSheet.vue';
import { PeriodKey } from 'src/utils/types';
import { isMobile } from 'src/utils/viewport';
import { PropType } from 'vue';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'PeriodSelector',
  components: {
    FrappeButton,
    FrappeSelect,
    MobileOptionsSheet,
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

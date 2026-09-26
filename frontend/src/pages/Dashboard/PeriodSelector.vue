<template>
  <FrappeSelect
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
import { Select as FrappeSelect } from 'frappe-ui';
import { PeriodKey } from 'src/utils/types';
import { PropType } from 'vue';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'PeriodSelector',
  components: {
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

<template>
  <div class="flex items-center gap-5">
    <div
      role="img"
      :aria-label="t`Top Expenses`"
      class="size-32 shrink-0 rounded-full"
      :style="donutStyle"
    />
    <ul class="flex min-w-0 flex-1 flex-col gap-3">
      <li v-for="row in rows" :key="row.account" class="flex flex-col gap-1">
        <div class="flex items-center gap-2 text-sm text-ink-gray-8">
          <span
            class="size-2 shrink-0 rounded-full"
            :style="{ backgroundColor: row.color }"
          />
          <span class="min-w-0 flex-1 truncate">{{ row.account }}</span>
          <span class="tabular-nums text-ink-gray-5">
            {{ Math.round(row.share) }}%
          </span>
        </div>
        <div class="ps-4 text-sm-medium tabular-nums text-ink-gray-9">
          <span dir="ltr">{{ fyo.format(row.total, 'Currency') }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>
<script setup lang="ts">
import { fyo } from 'src/initFyo';
import { computed } from 'vue';

const props = defineProps<{
  expenses: {
    account: string;
    total: number;
    color: { color: string; darkColor: string };
  }[];
  total: number;
  darkMode: boolean;
}>();

// Share of the ring left as a gap between slices, in percent.
const GAP = 0.6;

const rows = computed(() =>
  props.expenses.map(({ account, total, color }) => ({
    account,
    total,
    color: props.darkMode ? color.darkColor : color.color,
    share: (total / props.total) * 100,
  }))
);

const donutStyle = computed(() => {
  const gap = rows.value.length > 1 ? GAP : 0;
  let start = 0;
  const slices = rows.value.map(({ color, share }) => {
    const end = start + share;
    const slice = `${color} ${start}% ${end - gap}%, var(--surface-base) ${
      end - gap
    }% ${end}%`;
    start = end;
    return slice;
  });

  return {
    background: `conic-gradient(${slices.join(', ')})`,
    mask: 'radial-gradient(circle, transparent 39px, #000 40px)',
  };
});
</script>

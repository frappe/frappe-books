<template>
  <div
    class="grid grid-cols-3 text-ink-gray-8 text-sm select-none items-center"
    style="height: 50px"
  >
    <!-- Length Display -->
    <div class="justify-self-start">
      {{
        `${(pageNo - 1) * count + 1} - ${Math.min(pageNo * count, itemCount)}`
      }}
    </div>

    <!-- Pagination Selector -->
    <div class="flex gap-1 items-center justify-self-center">
      <FrappeButton
        variant="ghost"
        size="xs"
        class="rtl-rotate-180"
        icon="lucide-chevron-left"
        :disabled="pageNo <= 1"
        aria-label="Previous page"
        @click="() => setPageNo(Math.max(1, pageNo - 1))"
      />
      <div
        class="grid items-center gap-1 rounded-4 bg-surface-gray-2 px-1 text-base tabular-nums"
        :style="{
          gridTemplateColumns: `${pageNumberWidth} auto ${pageNumberWidth}`,
        }"
      >
        <FrappeTextInput
          type="number"
          aria-label="Page number"
          class="min-w-0"
          variant="ghost"
          size="sm"
          :model-value="pageNo"
          min="1"
          :max="maxPages"
          @change="(e) => setPageNo(e.target.value)"
          @input="(e) => setPageNo(e.target.value)"
        />
        <span class="text-ink-gray-5">/</span>
        <span class="text-center">
          {{ maxPages }}
        </span>
      </div>
      <FrappeButton
        variant="ghost"
        size="xs"
        class="rtl-rotate-180"
        icon="lucide-chevron-right"
        :disabled="pageNo >= maxPages"
        aria-label="Next page"
        @click="() => setPageNo(Math.min(maxPages, pageNo + 1))"
      />
    </div>

    <!-- Count Selector -->
    <FrappeTabButtons
      v-if="filteredCounts.length"
      class="justify-self-end"
      :options="countOptions"
      :model-value="filteredCounts.includes(count) ? count : -1"
      @update:model-value="setCount"
    />
  </div>
</template>
<script>
import {
  Button as FrappeButton,
  TabButtons as FrappeTabButtons,
  TextInput as FrappeTextInput,
} from 'frappe-ui';
import { defineComponent } from 'vue';

export default defineComponent({
  components: { FrappeTabButtons, FrappeButton, FrappeTextInput },
  props: {
    itemCount: { type: Number, default: 0 },
    allowedCounts: { type: Array, default: () => [50, 100, 500, -1] },
  },
  emits: ['index-change'],
  data() {
    return {
      pageNo: 1,
      count: 0,
    };
  },
  computed: {
    maxPages() {
      return Math.max(1, Math.ceil(this.itemCount / this.count));
    },
    pageNumberWidth() {
      return `calc(${String(this.maxPages).length}ch + 1rem)`;
    },
    filteredCounts() {
      return this.allowedCounts.filter(this.filterCount);
    },
    countOptions() {
      return this.filteredCounts.map((value) => ({
        label: value === -1 ? this.t`All` : String(value),
        value,
      }));
    },
  },
  mounted() {
    this.count = this.allowedCounts[0];
    this.emitIndices();
  },
  methods: {
    filterCount(count) {
      if (count !== -1 && this.itemCount < count) {
        return false;
      }

      if (count === -1 && this.itemCount < this.allowedCounts[0]) {
        return false;
      }

      return true;
    },
    setPageNo(value) {
      value = parseInt(value);
      if (isNaN(value)) {
        return;
      }

      this.pageNo = Math.min(Math.max(1, value), this.maxPages);
      this.emitIndices();
    },
    setCount(count) {
      this.pageNo = 1;
      if (count === -1) {
        count = this.itemCount;
      }
      this.count = count;
      this.emitIndices();
    },
    emitIndices() {
      const indices = this.getSliceIndices();
      this.$emit('index-change', indices);
    },
    getSliceIndices() {
      const start = (this.pageNo - 1) * this.count;
      const end = this.pageNo * this.count;
      return { start, end };
    },
  },
});
</script>

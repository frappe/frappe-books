<template>
  <div class="flex flex-col w-full md:h-full">
    <PageHeader :title="t`Print ${title}`">
      <FrappeButton variant="solid" @click="print()">
        {{ t`Print` }}
      </FrappeButton>
    </PageHeader>

    <div
      class="outer-container overflow-y-auto"
    >
      <!-- Report Print Display Area -->
      <div
        ref="previewContainer"
        class="p-4 bg-surface-gray-1 overflow-auto"
      >
        <!-- Report Print Display Container -->
        <PrintSheet
          ref="printSheet"
          class="shadow-sm border mx-auto"
          :scale="scale"
          :width="size.width"
          :height="size.height"
        >
          <div class="bg-surface-base mx-auto">
            <div class="p-2">
              <div class="text-xl-semibold w-full flex justify-between">
                <h1>
                  {{ `${fyo.singles.PrintSettings?.company_name}` }}
                </h1>
                <p class="text-ink-gray-6">
                  {{ title }}
                </p>
              </div>
            </div>

            <!-- Report Data -->
            <div class="grid" :style="rowStyles">
              <template v-for="(row, r) of matrix" :key="`row-${r}`">
                <div
                  v-for="(cell, c) of row"
                  :key="`cell-${r}.${c}`"
                  :class="cellClasses(cell.idx, r)"
                  class="p-2"
                  style="min-height: 2rem"
                >
                  {{ cell.value }}
                </div>
              </template>
            </div>

            <div class="border-t p-2">
              <p class="text-xs text-right w-full">
                {{ fyo.format(new Date(), 'Datetime') }}
              </p>
            </div>
          </div>
        </PrintSheet>
      </div>

      <!-- Report Print Settings -->
      <div
        v-if="report"
        class="border-t md:border-t-0 md:border-l border-outline-gray-1 flex flex-col"
      >
        <p class="p-4 text-sm text-ink-gray-6">
          {{
            [
              t`Values cut off in the report are shown in full when printed.`,
              t`Report will use more than one page if required.`,
            ].join(' ')
          }}
        </p>
        <!-- Row Selection -->
        <div class="p-4 border-t border-outline-gray-1">
          <Int
            :show-label="true"
            :border="true"
            :df="{
              label: t`Start From Row Index`,
              fieldtype: 'Int',
              fieldname: 'numRows',
              minvalue: 1,
              maxvalue: report?.reportData.length ?? 1000,
            }"
            :value="start"
            @change="(v) => (start = v)"
          />
          <Int
            class="mt-4"
            :show-label="true"
            :border="true"
            :df="{
              label: t`Number of Rows`,
              fieldtype: 'Int',
              fieldname: 'numRows',
              minvalue: 0,
              maxvalue: report?.reportData.length ?? 1000,
            }"
            :value="limit"
            @change="(v) => (limit = v)"
          />
        </div>

        <!-- Size Selection -->
        <div class="border-t border-outline-gray-1 p-4">
          <Select
            :show-label="true"
            :border="true"
            :df="printSizeDf"
            :value="printSize"
            @change="(v) => (printSize = v)"
          />
          <Check
            class="mt-4"
            :show-label="true"
            :border="true"
            :df="{
              label: t`Is Landscape`,
              fieldname: 'isLandscape',
              fieldtype: 'Check',
            }"
            :value="isLandscape"
            @change="(v) => (isLandscape = v)"
          />
        </div>

        <!-- Pick Columns -->
        <div class="border-t border-outline-gray-1 p-4">
          <h2 class="text-sm text-ink-gray-5">
            {{ t`Pick Columns` }}
          </h2>
          <div
            class="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-6 border p-3 border-outline-gray-1"
          >
            <Check
              v-for="(col, i) of report?.columns"
              :key="col.fieldname"
              :show-label="true"
              :df="{
                label: col.label,
                fieldname: col.fieldname,
                fieldtype: 'Check',
              }"
              :value="columnSelection[i]"
              @change="(v) => (columnSelection[i] = v)"
            />
          </div>
        </div>
      </div>
    </div>

    <MobileFooter v-if="isMobile">
      <FrappeButton
        class="flex-1"
        size="lg"
        variant="solid"
        icon-left="lucide-printer"
        :label="t`Print`"
        @click="print()"
      />
    </MobileFooter>
  </div>
</template>
<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { Report } from 'reports/Report';
import { reports } from 'reports/index';
import { OptionField } from 'schemas/types';
import Check from 'src/components/Controls/Check.vue';
import Int from 'src/components/Controls/Int.vue';
import Select from 'src/components/Controls/Select.vue';
import PageHeader from 'src/components/PageHeader.vue';
import MobileFooter from 'src/mobile/MobileFooter.vue';
import { getReport } from 'src/utils/misc';
import { printDocument } from 'src/utils/printDocument';
import { showSidebar } from 'src/utils/refs';
import { paperSizeMap, printSizes } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { PropType, defineComponent } from 'vue';
import PrintSheet from 'src/components/PrintSheet.vue';

export default defineComponent({
  components: {
    PageHeader,
    FrappeButton,
    Check,
    Int,
    MobileFooter,
    PrintSheet,
    Select,
  },
  props: {
    reportName: {
      type: String as PropType<keyof typeof reports>,
      required: true,
    },
  },
  setup() {
    return { isMobile };
  },
  data() {
    return {
      start: 1,
      limit: 0,
      printSize: 'A4' as (typeof printSizes)[number],
      isLandscape: false,
      scale: 0.65,
      report: null as null | Report,
      columnSelection: [] as boolean[],
    };
  },
  computed: {
    title(): string {
      return reports[this.reportName]?.title ?? this.t`Report`;
    },
    printSizeDf(): OptionField {
      return {
        label: 'Print Size',
        fieldname: 'printSize',
        fieldtype: 'Select',
        options: printSizes
          .filter((p) => p !== 'Custom')
          .map((name) => ({ value: name, label: name })),
      };
    },
    matrix(): { value: string; idx: number }[][] {
      if (!this.report) {
        return [];
      }

      const columns = this.report.columns
        .map((col, idx) => ({ value: col.label, idx }))
        .filter((_, i) => this.columnSelection[i]);

      const matrix: { value: string; idx: number }[][] = [columns];
      const start = Math.max(this.start - 1, 0);
      const end = Math.min(start + this.limit, this.report.reportData.length);
      const slice = this.report.reportData.slice(start, end);

      for (let i = 0; i < slice.length; i++) {
        const row = slice[i];

        matrix.push([]);
        for (let j = 0; j < row.cells.length; j++) {
          if (!this.columnSelection[j]) {
            continue;
          }

          const value = row.cells[j].value;
          matrix.at(-1)?.push({ value, idx: Number(j) });
        }
      }

      return matrix;
    },
    rowStyles(): Record<string, string> {
      const style: Record<string, string> = {};
      const numColumns = this.columnSelection.filter(Boolean).length;
      style['grid-template-columns'] = `repeat(${numColumns}, minmax(0, auto))`;
      return style;
    },
    size(): { width: number; height: number } {
      const size = paperSizeMap[this.printSize];
      const long = size.width > size.height ? size.width : size.height;
      const short = size.width <= size.height ? size.width : size.height;

      if (this.isLandscape) {
        return { width: long, height: short };
      }

      return { width: short, height: long };
    },
  },
  watch: {
    size() {
      this.setScale();
    },
  },
  async mounted() {
    this.report = await getReport(this.reportName);
    this.limit = this.report.reportData.length;
    this.columnSelection = this.report.columns.map(() => true);

    await this.$nextTick();
    this.setScale();

    window.addEventListener('resize', this.setScale);
  },
  unmounted() {
    window.removeEventListener('resize', this.setScale);
  },
  methods: {
    setScale() {
      const el = this.$refs.previewContainer as HTMLElement | undefined;
      const pageWidthPx = this.size.width * 37.2;
      if (!pageWidthPx) {
        return;
      }
      let containerWidth: number;
      if (el && el.clientWidth > 0) {
        const style = window.getComputedStyle(el);
        const pl = parseFloat(style.paddingLeft) || 0;
        const pr = parseFloat(style.paddingRight) || 0;
        containerWidth = Math.max(el.clientWidth - pl - pr, 0);
      } else {
        // fallback: subtract settings panel, optional sidebar, and p-4 padding (32px)
        containerWidth = window.innerWidth - 26 * 16 - 32;
        if (showSidebar.value) {
          containerWidth -= 12 * 16;
        }
      }
      this.scale = Math.min(containerWidth / pageWidthPx, 1);
    },
    async print(): Promise<void> {
      const innerHTML = (
        this.$refs.printSheet as InstanceType<typeof PrintSheet>
      ).getHTML();
      if (typeof innerHTML !== 'string') {
        return;
      }

      const name = this.title + ' - ' + this.fyo.format(new Date(), 'Date');
      await printDocument(name, innerHTML, this.size.width, this.size.height);
    },
    cellClasses(cIdx: number, rIdx: number): string[] {
      const classes: string[] = [];
      if (!this.report) {
        return classes;
      }

      const col = this.report.columns[cIdx];
      const isFirst = cIdx === 0;
      if (col.align) {
        classes.push(`text-${col.align}`);
      }

      classes.push(rIdx === 0 ? 'text-sm-semibold' : 'text-sm');

      classes.push('border-t');
      if (!isFirst) {
        classes.push('border-l');
      }

      return classes;
    },
  },
});
</script>
<style scoped>
.outer-container {
  grid-template-columns: auto var(--w-quick-edit);
  @apply md:grid md:h-full md:overflow-auto;
}
</style>

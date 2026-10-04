<template>
  <div class="flex flex-col w-full md:h-full">
    <PageHeader :title="t`Print ${title}`">
      <FrappeButton variant="solid" @click="print()">
        {{ t`Print` }}
      </FrappeButton>
    </PageHeader>

    <div
      class="md:grid md:min-h-0 md:flex-1 md:grid-cols-[auto_var(--w-quick-edit)] md:grid-rows-[minmax(0,1fr)]"
    >
      <!-- Report Print Display Area -->
      <FrappeScrollArea class="bg-surface-gray-1" viewport-class="p-4 md:pb-10">
        <!-- Report Print Display Container -->
        <div ref="previewContainer">
          <PrintSheet
            ref="printSheet"
            class="shadow-sm border mx-auto"
            :scale="scale"
            :width="size.width"
            :height="size.height"
          >
            <!-- Inline styles, as Frappe's PDF renderer gets no app styles. -->
            <table style="width: 100%; border-collapse: collapse">
              <tr>
                <td style="padding: 0.5rem">
                  <h1 style="margin: 0; font-size: 1.25rem; font-weight: bold">
                    {{ fyo.singles.PrintSettings?.company_name }}
                  </h1>
                </td>
                <td style="padding: 0.5rem; text-align: right; color: #7c7c7c">
                  {{ title }}
                </td>
              </tr>
            </table>

            <table
              style="
                width: 100%;
                border-collapse: collapse;
                font-size: 0.875rem;
              "
            >
              <thead>
                <tr>
                  <th
                    v-for="(column, c) of columns"
                    :key="column.idx"
                    style="font-weight: bold"
                    :style="getCellStyle(c, column.idx)"
                  >
                    {{ column.label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, r) of rows" :key="r">
                  <td
                    v-for="(cell, c) of row"
                    :key="cell.idx"
                    :style="getCellStyle(c, cell.idx)"
                  >
                    {{ cell.value }}
                  </td>
                </tr>
              </tbody>
            </table>

            <p
              style="
                margin: 0;
                padding: 0.5rem;
                border-top: 1px solid #e2e2e2;
                text-align: right;
                font-size: 0.75rem;
              "
            >
              {{ fyo.format(new Date(), 'Datetime') }}
            </p>
          </PrintSheet>
        </div>
      </FrappeScrollArea>

      <!-- Report Print Settings -->
      <FrappeScrollArea
        v-if="report"
        class="border-t border-outline-gray-1 md:border-l md:border-t-0"
        viewport-class="pb-10"
      >
        <p class="p-4 text-p-sm text-ink-gray-6">
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
              label: t`Start from row index`,
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
              label: t`Number of rows`,
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
              label: t`Landscape`,
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
            {{ t`Pick columns` }}
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
      </FrappeScrollArea>
    </div>

    <MobileFooter v-if="isMobile">
      <FrappeButton
        class="flex-1"
        size="lg"
        variant="solid"
        icon-left="lucide-printer"
        :label="t`Print`"
        :loading="isSharing"
        @click="print()"
      />
    </MobileFooter>
  </div>
</template>
<script lang="ts">
import {
  Button as FrappeButton,
  ScrollArea as FrappeScrollArea,
} from 'frappe-ui';
import { t } from 'fyo';
import { Report } from 'reports/Report';
import { reports } from 'reports/index';
import { OptionField } from 'schemas/types';
import Check from 'src/components/Controls/Check.vue';
import Int from 'src/components/Controls/Int.vue';
import Select from 'src/components/Controls/Select.vue';
import PageHeader from 'src/components/PageHeader.vue';
import MobileFooter from 'src/mobile/MobileFooter.vue';
import { getReport } from 'src/utils/misc';
import { constructPDFDocument, printDocument } from 'src/utils/printDocument';
import { canSharePDF, getReportPDF } from 'src/utils/printFormatApi';
import { showSidebar } from 'src/utils/refs';
import { paperSizeMap, printSizes } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { PropType, StyleValue, defineComponent } from 'vue';
import PrintSheet from 'src/components/PrintSheet.vue';
import { usePDFShare } from './pdfShare';

const CELL_BORDER = '1px solid #e2e2e2';

export default defineComponent({
  components: {
    PageHeader,
    FrappeButton,
    FrappeScrollArea,
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
    return {
      isMobile,
      ...usePDFShare(t`PDF ready. Tap Print again.`),
    };
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
    columns(): { label: string; idx: number }[] {
      return (this.report?.columns ?? [])
        .map((column, idx) => ({ label: column.label, idx }))
        .filter(({ idx }) => this.columnSelection[idx]);
    },
    rows(): { value: string; idx: number }[][] {
      if (!this.report) {
        return [];
      }

      const start = Math.max(this.start - 1, 0);
      const end = Math.min(start + this.limit, this.report.reportData.length);
      return this.report.reportData
        .slice(start, end)
        .map((row) =>
          row.cells
            .map((cell, idx) => ({ value: cell.value, idx }))
            .filter(({ idx }) => this.columnSelection[idx])
        );
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
      const { width, height } = this.size;
      if (this.isMobile && canSharePDF()) {
        // A home-screen app has no way out of a print window, so phones
        // print from the share sheet.
        const html = constructPDFDocument(name, innerHTML, width, height);
        await this.share(html, name, () => getReportPDF(name, html));
        return;
      }

      await printDocument(name, innerHTML, width, height);
    },
    getCellStyle(position: number, columnIndex: number): StyleValue {
      return {
        padding: '0.5rem',
        borderTop: CELL_BORDER,
        borderLeft: position ? CELL_BORDER : 'none',
        textAlign: this.report?.columns[columnIndex].align ?? 'left',
      };
    },
  },
});
</script>

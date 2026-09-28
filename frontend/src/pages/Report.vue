<template>
  <div class="flex flex-col w-full h-full">
    <PageHeader :title="title">
      <template #mobile>
        <FrappeButton
          variant="ghost"
          size="md"
          icon="lucide-printer"
          :label="t`Print`"
          @click="routeTo(`/report-print/${reportClassName}`)"
        />
        <span class="relative">
          <FrappeButton
            variant="ghost"
            size="md"
            icon="lucide-list-filter"
            :label="t`Filters`"
            :disabled="!report"
            @click="filtersOpen = true"
          />
          <span
            v-if="hasFilterChanges"
            data-testid="filters-set"
            class="pointer-events-none absolute end-1 top-1 size-2 rounded-full bg-surface-gray-7 shadow-[0_0_0_1.5px_var(--surface-base)]"
          />
        </span>
      </template>
      <DropdownWithActions
        v-for="group of groupedActions"
        :key="group.label"
        :type="group.type"
        :actions="group.actions"
      >
        {{ group.group }}
      </DropdownWithActions>
      <FrappeButton
        ref="printButton"
        icon="lucide-printer"
        :label="t`Open Report Print View`"
        :tooltip="t`Open Report Print View`"
        @click="routeTo(`/report-print/${reportClassName}`)"
      />
    </PageHeader>

    <template v-if="isMobile">
      <MobileReport
        v-if="report"
        :report="(report as Report)"
        :defaults="filterDefaults"
        :loading="loading || (report.loading && !report.reportData.length)"
        @open-filters="filtersOpen = true"
        @clear-filters="clearFilters"
      />
      <MobileReportSkeleton v-else :values="[128]" :height="48" :lines="1" />
      <MobileReportFilters
        v-if="report"
        v-model:open="filtersOpen"
        :report="(report as Report)"
        :defaults="filterDefaults"
        @apply="reload"
      />
    </template>

    <!-- Filters -->
    <div
      v-else-if="report && report.filters.length"
      class="grid grid-cols-5 gap-4 p-4 border-b border-outline-gray-1"
    >
      <FormControl
        v-for="field in report.filters"
        :key="field.fieldname + '-filter'"
        :border="true"
        size="small"
        class="min-w-0 self-start w-full"
        :show-label="true"
        :df="field"
        :value="report.get(field.fieldname)"
        :read-only="loading"
        @change="
          async (value: DocValue) => await report?.set(field.fieldname, value)
        "
      />
    </div>

    <!-- Report Body -->
    <ListReport v-if="report && !isMobile" :report="report" class="" />
  </div>
</template>
<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { reports } from 'reports';
import { Report } from 'reports/Report';
import FormControl from 'src/components/Controls/FormControl.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import PageHeader from 'src/components/PageHeader.vue';
import ListReport from 'src/components/Report/ListReport.vue';
import {
  FilterValues,
  MobileFilters,
  getDefaultFilters,
} from 'src/components/Report/Mobile/MobileFilters';
import MobileReport from 'src/components/Report/Mobile/MobileReport.vue';
import MobileReportFilters from 'src/components/Report/Mobile/MobileReportFilters.vue';
import MobileReportSkeleton from 'src/components/Report/Mobile/MobileReportSkeleton.vue';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { docsPathMap, showReport } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { ActionGroup } from 'src/utils/types';
import { routeTo } from 'src/utils/ui';
import { isMobile } from 'src/utils/viewport';
import { PropType, computed, defineComponent, inject } from 'vue';

export default defineComponent({
  components: {
    PageHeader,
    FormControl,
    ListReport,
    DropdownWithActions,
    FrappeButton,
    MobileReport,
    MobileReportFilters,
    MobileReportSkeleton,
  },
  provide() {
    return {
      report: computed(() => this.report),
    };
  },
  props: {
    reportClassName: {
      type: String as PropType<keyof typeof reports>,
      required: true,
    },
    defaultFilters: {
      type: String,
      default: '{}',
    },
  },
  setup() {
    return { shortcuts: inject(shortcutsKey), isMobile };
  },
  data() {
    return {
      loading: false,
      report: null as null | Report,
      filterDefaults: {} as FilterValues,
      filtersOpen: false,
    };
  },
  computed: {
    title() {
      return reports[this.reportClassName]?.title ?? t`Report`;
    },
    groupedActions() {
      const actions = this.report?.getActions() ?? [];
      const actionsMap = actions.reduce((acc, ac) => {
        if (!ac.group) {
          ac.group = 'none';
        }

        acc[ac.group] ??= {
          group: ac.group,
          label: ac.label ?? '',
          type: ac.type ?? 'secondary',
          actions: [],
        };

        acc[ac.group].actions.push(ac);
        return acc;
      }, {} as Record<string, ActionGroup>);

      return Object.values(actionsMap);
    },
    hasFilterChanges(): boolean {
      return (
        !!this.report &&
        new MobileFilters(this.report as Report, this.filterDefaults)
          .hasChanges
      );
    },
  },
  async activated() {
    docsPathRef.value =
      docsPathMap[this.reportClassName] ?? docsPathMap.Reports!;
    await this.setReportData();

    const filters = this.$route.query as Record<string, DocValue>;
    const validFilters: Record<string, DocValue> = {};

    if (filters.defaultFilters && typeof filters.defaultFilters === 'string') {
      const parsed = JSON.parse(filters.defaultFilters);
      Object.assign(validFilters, parsed);
    }

    for (const [key, value] of Object.entries(filters)) {
      if (key !== 'defaultFilters' && typeof value === 'string') {
        validFilters[key] = value;
      }
    }
    const filterKeys = Object.keys(validFilters);
    for (const key of filterKeys) {
      await this.report?.set(key, validFilters[key]);
    }

    if (filterKeys.length) {
      await this.report?.updateData();
    }

    this.shortcuts?.pmod.set(this.reportClassName, ['KeyP'], async () => {
      await routeTo(`/report-print/${this.reportClassName}`);
    });
  },
  deactivated() {
    docsPathRef.value = '';
    this.shortcuts?.delete(this.reportClassName);
  },
  methods: {
    routeTo,
    async setReportData() {
      const isNew = !this.report;
      this.report = await showReport(
        this.report as Report | null,
        this.reportClassName
      );
      if (isNew) {
        this.filterDefaults = await getDefaultFilters(this.report as Report);
      }
    },
    async reload() {
      this.loading = true;
      try {
        await this.report?.updateData();
      } finally {
        this.loading = false;
      }
    },
    async clearFilters() {
      await this.report?.setFilters(this.filterDefaults);
      await this.reload();
    },
  },
});
</script>

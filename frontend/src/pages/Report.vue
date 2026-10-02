<template>
  <div class="flex flex-col w-full h-full">
    <PageHeader :title="title">
      <template #mobile-title>
        <MobileReportSwitcher :title="title" />
      </template>
      <template #mobile>
        <FrappeButton
          variant="ghost"
          size="md"
          icon="lucide-printer"
          :label="t`Print`"
          @click="routeTo(`/report-print/${reportClassName}`)"
        />
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
        @reset-filter="resetFilter"
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

    <ReportFilters
      v-else-if="report && report.filters.length"
      :report="(report as Report)"
      :loading="loading"
    />

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
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import PageHeader from 'src/components/PageHeader.vue';
import ListReport from 'src/components/Report/ListReport.vue';
import ReportFilters from 'src/components/Report/ReportFilters.vue';
import {
  FilterValues,
  getDefaultFilters,
} from 'src/components/Report/Mobile/MobileFilters';
import MobileReport from 'src/components/Report/Mobile/MobileReport.vue';
import MobileReportFilters from 'src/components/Report/Mobile/MobileReportFilters.vue';
import MobileReportSkeleton from 'src/components/Report/Mobile/MobileReportSkeleton.vue';
import MobileReportSwitcher from 'src/components/Report/Mobile/MobileReportSwitcher.vue';
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
    ListReport,
    ReportFilters,
    DropdownWithActions,
    FrappeButton,
    MobileReport,
    MobileReportFilters,
    MobileReportSkeleton,
    MobileReportSwitcher,
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
  },
  async activated() {
    docsPathRef.value =
      docsPathMap[this.reportClassName] ?? docsPathMap.Reports!;
    await this.setReportData();

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
        this.reportClassName,
        this.getRouteFilters()
      );
      if (isNew) {
        this.filterDefaults = await getDefaultFilters(this.report as Report);
      }
    },
    getRouteFilters(): Record<string, DocValue> {
      const query = this.$route.query as Record<string, DocValue>;
      const filters: Record<string, DocValue> = {};
      if (query.defaultFilters && typeof query.defaultFilters === 'string') {
        Object.assign(filters, JSON.parse(query.defaultFilters));
      }

      for (const [key, value] of Object.entries(query)) {
        if (key !== 'defaultFilters' && typeof value === 'string') {
          filters[key] = value;
        }
      }

      return filters;
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
    async resetFilter(fieldname: string) {
      await this.report?.setFilters({
        [fieldname]: this.filterDefaults[fieldname],
      });
      await this.reload();
    },
  },
});
</script>

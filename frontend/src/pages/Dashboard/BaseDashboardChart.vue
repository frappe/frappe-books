<script lang="ts">
import { DEFAULT_LOCALE } from 'fyo/utils/consts';
import { fyo } from 'src/initFyo';
import { getPhoneAxisLabels } from 'src/utils/chart';
import { PeriodKey } from 'src/utils/types';
import { isMobile } from 'src/utils/viewport';
import { PropType } from 'vue';
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
    commonPeriod: { type: String as PropType<PeriodKey>, default: 'This Year' },
  },
  emits: ['period-change'],
  data() {
    return {
      period: 'This Year' as PeriodKey,
      periodOptions: [
        'This Year',
        'YTD',
        'This Quarter',
        'This Month',
      ] as PeriodKey[],
      isLoaded: false,
      hasFailed: false,
    };
  },
  computed: {
    isMobile(): boolean {
      return isMobile.value;
    },
    /** Phones replace a section's body while it first loads or after it fails. */
    showLoadState(): boolean {
      return this.isMobile && (!this.isLoaded || this.hasFailed);
    },
    /**
     * frappe-ui charts mishandle taps: the tooltip closes when the finger
     * lifts, and the focus that follows moves it to the first month. Keeping
     * touch events from the chart lets the tap's mouse events show it instead.
     */
    phoneChartListeners() {
      if (!this.isMobile) {
        return {};
      }

      const stop = (event: Event) => event.stopPropagation();
      return {
        onTouchstartCapture: stop,
        onTouchmoveCapture: stop,
        onTouchendCapture: stop,
        onMousedown: (event: Event) => event.preventDefault(),
      };
    },
    phoneAxisLabels() {
      const locale =
        (fyo.singles.SystemSettings?.locale as string | undefined) ??
        DEFAULT_LOCALE;
      return getPhoneAxisLabels(locale);
    },
  },
  watch: {
    period: 'periodChange',
    commonPeriod(val: PeriodKey) {
      if (!this.periodOptions.includes(val)) {
        return;
      }

      this.period = val;
    },
  },
  async activated() {
    await this.loadData();
  },
  methods: {
    async periodChange() {
      this.$emit('period-change', this.period);
      await this.loadData();
    },
    async loadData() {
      this.hasFailed = false;
      try {
        await this.setData();
        this.isLoaded = true;
      } catch (error) {
        this.hasFailed = true;
        console.error(error);
      }
    },
    async setData() {
      return Promise.resolve(null);
    },
  },
});
</script>

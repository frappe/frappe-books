<script lang="ts">
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from 'fyo/utils/consts';
import { fyo } from 'src/initFyo';
import {
  getCompactCurrencyFormat,
  getPhoneAxisLabels,
} from 'src/utils/chart';
import { PeriodKey } from 'src/utils/types';
import { isMobile } from 'src/utils/viewport';
import { PropType } from 'vue';
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
    period: { type: String as PropType<PeriodKey>, default: 'This Year' },
  },
  data() {
    return {
      isLoaded: false,
      error: null as string | null,
    };
  },
  computed: {
    isMobile(): boolean {
      return isMobile.value;
    },
    /** Phones set each widget on its own card. */
    cardClass(): string | undefined {
      return this.isMobile
        ? 'overflow-hidden rounded-6 border bg-surface-base p-3'
        : undefined;
    },
    /**
     * frappe-ui charts mishandle taps: the tooltip closes when the finger
     * lifts, and the focus that follows moves it to the first month. Keeping
     * touch events from the chart lets the tap's mouse events show it instead
     * (frappe/frappe-ui#1222).
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
    locale(): string {
      return (
        (fyo.singles.SystemSettings?.locale as string | undefined) ??
        DEFAULT_LOCALE
      );
    },
    phoneAxisLabels() {
      return getPhoneAxisLabels(this.locale);
    },
    /** Amounts short enough for a small space, e.g. "₹ 1.2L". */
    compactCurrency(): (value: number) => string {
      const currency =
        (fyo.singles.SystemSettings?.currency as string | undefined) ??
        DEFAULT_CURRENCY;
      return getCompactCurrencyFormat(
        this.locale,
        fyo.currencySymbols[currency]
      );
    },
  },
  watch: {
    period: 'loadData',
  },
  async activated() {
    await this.loadData();
  },
  methods: {
    async loadData() {
      this.error = null;
      try {
        await this.setData();
        this.isLoaded = true;
      } catch (error) {
        this.error = String(error);
        console.error(error);
      }
    },
    async setData() {
      return Promise.resolve(null);
    },
  },
});
</script>

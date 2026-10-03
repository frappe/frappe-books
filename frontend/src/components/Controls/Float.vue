<script lang="ts">
import { formatNumber, roundNumber } from 'fyo/utils/format';
import { getFloatPrecision, getRoundingMethod } from 'src/utils/precision';
import { getIsNullOrUndef } from 'utils/index';
import { defineComponent } from 'vue';
import Int from './Int.vue';

export default defineComponent({
  name: 'Float',
  extends: Int,
  computed: {
    inputMode(): string {
      return 'decimal';
    },
    precision(): number | null {
      return getFloatPrecision();
    },
    /** Desk's format_for_input: the number format, or nothing for no number. */
    inputValue(): string {
      const value: unknown = this.parse(this.value);
      // Desk shows a Float without a precision to 3 decimals.
      return getIsNullOrUndef(value)
        ? ''
        : formatNumber(value, this.fyo, this.precision ?? 3);
    },
  },
  methods: {
    /** Desk's flt of a typed value, to the field's precision: null for text that is not a number. */
    parse(value: unknown): number | null {
      const number = this.toNumber(value);
      return typeof value === 'string' && number !== null
        ? this.round(number)
        : number;
    },
    round(number: number): number {
      return roundNumber(number, this.precision, getRoundingMethod());
    },
  },
});
</script>

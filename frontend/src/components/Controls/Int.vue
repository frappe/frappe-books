<script lang="ts">
import { parseNumber } from 'fyo/utils/format';
import { getIsNullOrUndef, safeParseFloat } from 'utils/index';
import { defineComponent } from 'vue';
import Data from './Data.vue';

/** A number input that types, reads and shows numbers as Frappe's desk does. */
export default defineComponent({
  name: 'Int',
  extends: Data,
  computed: {
    // Desk's number inputs are text inputs, so grouped numbers and arithmetic can be typed.
    inputType(): 'text' {
      return 'text';
    },
    inputMode(): string {
      return 'numeric';
    },
  },
  methods: {
    /** Desk's cint of a typed value: null for text that is not a number. */
    parse(value: unknown): number | null {
      const number = this.toNumber(value);
      return number === null ? null : Math.trunc(number);
    },
    toNumber(value: unknown): number | null {
      if (typeof value === 'string') {
        return parseNumber(value, this.fyo);
      }

      return getIsNullOrUndef(value) ? null : safeParseFloat(value);
    },
    onFocus(e: FocusEvent) {
      if (e.target instanceof HTMLInputElement) {
        e.target.select();
        this.$emit('focus', e);
      }
    },
    onBlur(e: FocusEvent) {
      const target = e.target;
      // Desk changes a value only when it was edited.
      if (
        !(target instanceof HTMLInputElement) ||
        target.value === String(this.inputValue)
      ) {
        return;
      }

      this.triggerChange(target.value);
      // Desk formats the value again; an accepted change re-renders it.
      target.value = String(this.inputValue);
    },
  },
});
</script>

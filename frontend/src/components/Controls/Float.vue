<script lang="ts">
import { formatNumber } from 'fyo/utils/format';
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
    /** Desk's format_for_input: the number format, or nothing for no number. */
    inputValue(): string {
      const value: unknown = this.parse(this.value);
      return getIsNullOrUndef(value) ? '' : formatNumber(value, this.fyo);
    },
  },
  methods: {
    /** Desk's flt of a typed value: null for text that is not a number. */
    parse(value: unknown): number | null {
      return this.toNumber(value);
    },
  },
});
</script>

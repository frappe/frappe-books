<script lang="ts">
import { formatPercentNumber } from 'fyo/utils/format';
import { NumberField } from 'schemas/types';
import { getFloatPrecision } from 'src/utils/precision';
import { defineComponent } from 'vue';
import Float from './Float.vue';

export default defineComponent({
  name: 'Percent',
  extends: Float,
  computed: {
    suffix(): string {
      return '%';
    },
    /** The DocField's precision, else Frappe's float precision. */
    precision(): number | null {
      return (this.df as NumberField).precision ?? getFloatPrecision();
    },
    inputValue(): string {
      const value: unknown = this.parse(this.value);
      return formatPercentNumber(value, this.fyo, this.precision);
    },
  },
});
</script>

<script lang="ts">
import type { Fyo } from 'fyo';
import { parseNumber } from 'fyo/utils/format';
import { Money } from 'pesa';
import { getIsNullOrUndef, safeParsePesa } from 'utils/index';
import { defineComponent, nextTick } from 'vue';
import Float from './Float.vue';

/** An amount, or one typed as Desk reads it; null for text that is not a number. */
function toAmount(value: unknown, fyo: Fyo): Money | null {
  if (typeof value === 'string') {
    const number = parseNumber(value, fyo);
    return number === null ? null : fyo.pesa(number);
  }

  return getIsNullOrUndef(value) ? null : safeParsePesa(value, fyo);
}

export default defineComponent({
  name: 'Currency',
  extends: Float,
  props: {
    focusInput: Boolean,
  },
  mounted() {
    if (this.focusInput) {
      nextTick(() => {
        this.focus();
      });
    }
  },
  methods: {
    parse(value: unknown): Money | null {
      return toAmount(value, this.fyo);
    },
  },
});
</script>

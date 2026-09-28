<script lang="ts">
import { defineComponent } from 'vue';
import { fyo } from 'src/initFyo';
import DateVue from './Date.vue';

export default defineComponent({
  extends: DateVue,
  computed: {
    pickerComponent(): string {
      return 'FrappeDateTimePicker';
    },
    nativeType(): 'date' | 'datetime-local' {
      return 'datetime-local';
    },
    nativeValue(): string {
      const date = this.toDateTime(this.value);
      return date?.isValid ? date.toFormat("yyyy-MM-dd'T'HH:mm") : '';
    },
    inputValue(): string {
      const date = this.toDateTime(this.value);
      return date?.isValid ? date.toFormat('yyyy-MM-dd HH:mm:ss') : '';
    },
    frappeDateFormat(): string {
      const format = fyo.singles.SystemSettings?.dateFormat ?? 'MMM d, y';
      const dateFormat = String(format)
        .replace(/yyyy|y/g, 'YYYY')
        .replace(/dd|d/g, 'DD');
      return `${dateFormat} HH:mm:ss`;
    },
  },
});
</script>

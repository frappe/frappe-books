<script lang="ts">
import { defineComponent } from 'vue';
import DateVue from './Date.vue';
import { getDatePickerFormat } from './datePickerFormat';

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
      return `${getDatePickerFormat()} HH:mm:ss`;
    },
  },
});
</script>

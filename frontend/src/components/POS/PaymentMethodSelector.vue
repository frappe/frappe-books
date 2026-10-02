<template>
  <FrappeRadioGroup
    :model-value="selected"
    :label="t`Payment method`"
    :required="true"
    size="md"
    padded
    @update:model-value="(method) => $emit('select', method)"
  >
    <FrappeRadio
      v-for="method in methods"
      :key="method"
      :value="method"
      :label="t`${method}`"
    />
  </FrappeRadioGroup>
</template>

<script lang="ts">
import {
  Radio as FrappeRadio,
  RadioGroup as FrappeRadioGroup,
} from 'frappe-ui';
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  name: 'PaymentMethodSelector',
  components: { FrappeRadio, FrappeRadioGroup },
  props: {
    methods: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    selected: String,
  },
  emits: ['select'],
});
</script>

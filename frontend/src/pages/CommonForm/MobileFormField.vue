<template>
  <div class="min-w-0" :data-fieldname="field.fieldname">
    <FormControl
      class="w-full"
      :df="field"
      :value="doc[field.fieldname]"
      :show-label="true"
      :border="true"
      :invalid="Boolean(error)"
      :layout="field.fieldtype === 'Check' ? 'inline' : undefined"
      @change="(value: DocValue) => $emit('change', value)"
    />
    <FrappeErrorMessage class="mt-1.5" :message="error" />
  </div>
</template>
<script setup lang="ts">
import { ErrorMessage as FrappeErrorMessage } from 'frappe-ui';
import { DocValue } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { Field } from 'schemas/types';
import FormControl from 'src/components/Controls/FormControl.vue';

defineProps<{ field: Field; doc: FrappeDoc; error?: string }>();
defineEmits<{ change: [value: DocValue] }>();
</script>

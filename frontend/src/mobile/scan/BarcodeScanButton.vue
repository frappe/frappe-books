<template>
  <FrappeButton
    v-bind="$attrs"
    icon="lucide-scan-barcode"
    :label="t`Scan barcode`"
    @click="isOpen = true"
  />
  <BarcodeScanSheet
    v-model:open="isOpen"
    @scan="(code: string) => emit('scan', code)"
  />
</template>
<script setup lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { ref } from 'vue';
import BarcodeScanSheet from './BarcodeScanSheet.vue';

/** Opens the phone camera and reports the first barcode it reads. */
defineOptions({ inheritAttrs: false });
const emit = defineEmits<{ scan: [code: string] }>();
const isOpen = ref(false);
</script>

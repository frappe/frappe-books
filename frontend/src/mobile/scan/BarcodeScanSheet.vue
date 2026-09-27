<template>
  <FrappeBottomSheet v-model:open="isOpen" :title="t`Scan barcode`">
    <div
      class="flex flex-col gap-3 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <div
        :id="viewfinderId"
        ref="viewfinder"
        class="aspect-square w-full overflow-hidden rounded-6 bg-surface-gray-9"
      />
      <p
        class="text-center text-p-base"
        :class="error ? 'text-ink-red-4' : 'text-ink-gray-6'"
        :role="error ? 'alert' : undefined"
      >
        {{ error || t`Point the camera at a barcode.` }}
      </p>
      <FrappeButton size="lg" :label="t`Cancel`" @click="isOpen = false" />
    </div>
  </FrappeBottomSheet>
</template>
<script setup lang="ts">
import { t } from 'fyo';
import {
  BottomSheet as FrappeBottomSheet,
  Button as FrappeButton,
} from 'frappe-ui';
import { onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue';
import { loadHtml5Qrcode, type Html5Qrcode } from './html5Qrcode';

const isOpen = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ scan: [code: string] }>();

const viewfinderId = `barcode-viewfinder-${useId()}`;
const viewfinder = useTemplateRef<HTMLElement>('viewfinder');
const error = ref('');
let scanner: Html5Qrcode | null = null;

// The camera runs while the sheet's viewfinder is on screen.
watch(viewfinder, (element) => void (element ? start() : stop()));
onBeforeUnmount(stop);

async function start() {
  error.value = '';
  try {
    const Html5QrcodeScanner = await loadHtml5Qrcode();
    if (!viewfinder.value) {
      return;
    }

    scanner = new Html5QrcodeScanner(viewfinderId, { verbose: false });
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 160 } },
      onScan,
      () => undefined
    );
  } catch (reason) {
    error.value = String(reason).includes('NotAllowedError')
      ? t`Camera access is blocked. Allow it in the browser settings, or type the barcode.`
      : t`Could not start the camera: ${String(reason)}`;
  }
}

async function onScan(code: string) {
  // Frames keep decoding until the camera stops.
  if (!scanner) {
    return;
  }

  await stop();
  isOpen.value = false;
  emit('scan', code);
}

async function stop() {
  const current = scanner;
  scanner = null;
  if (current?.isScanning) {
    await current.stop();
  }
  current?.clear();
}
</script>

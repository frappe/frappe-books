<template>
  <FrappeTextInput
    class="w-full"
    type="text"
    :size="isMobile ? 'lg' : 'md'"
    :variant="isMobile ? 'subtle' : 'outline'"
    :label="t`Barcode`"
    :placeholder="t`Enter barcode`"
    @change="handleChange"
  >
    <template #suffix>
      <BarcodeScanButton
        v-if="isMobile"
        variant="ghost"
        size="sm"
        @scan="selectItem"
      />
      <span
        v-else
        class="lucide-scan-line size-4 text-ink-gray-5"
        aria-hidden="true"
      />
    </template>
  </FrappeTextInput>
</template>

<script lang="ts">
import { showToast } from 'src/utils/interactive';
import {
  findScannedPOSItem,
  getScannableItems,
} from 'src/utils/posItemSearch';
import { TextInput as FrappeTextInput } from 'frappe-ui';
import BarcodeScanButton from 'src/mobile/scan/BarcodeScanButton.vue';
import { isMobile } from 'src/utils/viewport';
import { defineComponent } from 'vue';
export default defineComponent({
  components: { BarcodeScanButton, FrappeTextInput },
  emits: ['item-selected'],
  setup() {
    return { isMobile };
  },
  data() {
    return {
      timerId: null,
      barcode: '',
      cooldown: '',
    } as {
      timerId: null | ReturnType<typeof setTimeout>;
      barcode: string;
      cooldown: string;
    };
  },
  mounted() {
    document.addEventListener('keydown', this.scanListener);
  },
  unmounted() {
    document.removeEventListener('keydown', this.scanListener);
  },
  activated() {
    document.addEventListener('keydown', this.scanListener);
  },
  deactivated() {
    document.removeEventListener('keydown', this.scanListener);
  },
  methods: {
    handleChange(e: Event) {
      const elem = e.target as HTMLInputElement;
      this.selectItem(elem.value);
      elem.value = '';
    },
    /** Matches the code as POS does: scale barcode, barcode, then item. */
    async selectItem(code: string) {
      const barcode = code.trim();
      if (!barcode) {
        return;
      }

      /**
       * Between two entries of the same item, this adds
       * a cooldown period of 100ms. This is to prevent
       * double entry.
       */
      if (this.cooldown === barcode) {
        return;
      }
      this.cooldown = barcode;
      setTimeout(() => (this.cooldown = ''), 100);

      const settings = this.fyo.singles.POSSettings;
      const items = await getScannableItems(barcode, settings);
      const scanned = findScannedPOSItem(items, barcode, settings);
      if (!scanned) {
        return this.error(this.t`Item with barcode ${barcode} not found.`);
      }

      const { item, quantity } = scanned;
      this.success(this.t`${item.name} quantity ${quantity} added.`);
      this.$emit('item-selected', item.name, quantity);
    },
    async scanListener({ key, code }: KeyboardEvent) {
      /**
       * Based under the assumption that
       * - Barcode scanners trigger keydown events
       * - Keydown events are triggered quicker than human can
       *    i.e. at max 20ms between events
       * - Keydown events are triggered for barcode digits
       * - The sequence of digits might be punctuated by a return
       */

      const keyCode = Number(key);
      const isEnter = code === 'Enter';
      if (Number.isNaN(keyCode) && !isEnter) {
        return;
      }

      if (isEnter) {
        return await this.setItemFromBarcode();
      }

      this.clearInterval();

      this.barcode += key;
      this.timerId = setTimeout(async () => {
        await this.setItemFromBarcode();
        this.barcode = '';
      }, 20);
    },
    async setItemFromBarcode() {
      if (this.barcode.length < 12) {
        return;
      }

      await this.selectItem(this.barcode);

      this.barcode = '';
      this.clearInterval();
    },
    clearInterval() {
      if (this.timerId === null) {
        return;
      }

      clearInterval(this.timerId);
      this.timerId = null;
    },
    error(message: string) {
      showToast({ type: 'error', message });
    },
    success(message: string) {
      showToast({ type: 'success', message });
    },
  },
});
</script>

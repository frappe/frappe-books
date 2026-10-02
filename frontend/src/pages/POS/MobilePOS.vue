<template>
  <div class="flex flex-1 flex-col">
    <div class="flex gap-2 px-4 py-3">
      <FrappeTextInput
        class="min-w-0 flex-1"
        type="search"
        size="lg"
        variant="subtle"
        enterkeyhint="search"
        :placeholder="t`Search items`"
        :aria-label="t`Search items`"
        :model-value="searchTerm"
        @update:model-value="(term: string) => $emit('search', term)"
        @keydown.enter="onEnter"
      >
        <template #prefix>
          <FrappeIcon icon="lucide-search" class="size-4 text-ink-gray-5" />
        </template>
      </FrappeTextInput>
      <BarcodeScanButton
        variant="subtle"
        size="lg"
        @scan="(code: string) => $emit('search', code, true)"
      />
    </div>

    <div
      v-if="items.length"
      class="grid flex-1 grid-cols-2 content-start gap-2 px-4 pb-4"
    >
      <button
        v-for="item in items"
        :key="item.name"
        type="button"
        class="relative flex min-w-0 flex-col gap-2 rounded-6 border bg-surface-base p-2 text-start active:bg-surface-gray-1"
        :class="
          cartQuantities[item.name]
            ? 'border-outline-gray-4'
            : 'border-outline-gray-1'
        "
        :aria-label="t`Add ${item.name}`"
        @click="$emit('addItem', item)"
      >
        <span
          class="flex h-21 items-center justify-center overflow-hidden rounded-4 bg-surface-gray-2 text-3xl-semibold text-ink-gray-5"
        >
          <img
            v-if="item.image"
            :src="item.image"
            alt=""
            class="size-full object-cover"
          />
          <template v-else>{{ getItemInitials(item.name) }}</template>
        </span>
        <span
          class="line-clamp-2 min-h-[2lh] px-1 text-p-base-medium text-ink-gray-8"
        >
          {{ item.name }}
        </span>
        <span
          class="flex justify-between gap-1 px-1 pb-0.5 text-sm tabular-nums"
        >
          <span class="text-ink-gray-8" dir="ltr">
            {{ fyo.format(item.rate, 'Currency') }}
          </span>
          <span class="text-end text-ink-gray-5">
            {{ item.trackItem ? t`${item.availableQty} in stock` : '—' }}
          </span>
        </span>
        <FrappeBadge
          v-if="cartQuantities[item.name]"
          class="absolute end-3 top-3"
          variant="solid"
          size="lg"
          :label="cartQuantities[item.name]"
        />
      </button>
    </div>
    <MobileEmptyState
      v-else
      class="flex-1 pb-16"
      :icon="searchTerm ? 'lucide-search-x' : 'lucide-package'"
      :title="t`No items found`"
    />

    <MobileFooter v-if="sinvDoc.items?.length">
      <FrappeButton
        class="flex-1"
        variant="solid"
        size="lg"
        icon-left="lucide-shopping-cart"
        @click="sheet = 'cart'"
      >
        {{ itemCountLabel }}
        <template #suffix>
          <span class="ms-auto tabular-nums">
            <span dir="ltr">
              {{ fyo.format(sinvDoc.grand_total ?? fyo.pesa(0), 'Currency') }}
            </span>
          </span>
        </template>
      </FrappeButton>
    </MobileFooter>

    <MobilePOSCart
      :open="sheet === 'cart'"
      :disable-pay="disablePay"
      @update:open="(open: boolean) => (sheet = open ? 'cart' : null)"
      @set-customer="(party: string) => $emit('setCustomer', party)"
      @edit="editRow"
      @hold="closeCart('hold')"
      @pay="closeCart('pay')"
    />
    <MobilePOSLineSheet
      :row="sheet === 'line' ? editingRow : null"
      @close="sheet = 'cart'"
    />
  </div>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import {
  Badge as FrappeBadge,
  Button as FrappeButton,
  Icon as FrappeIcon,
  TextInput as FrappeTextInput,
} from 'frappe-ui';
import type { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import { POSItem } from 'src/components/POS/types';
import { fyo } from 'src/initFyo';
import MobileEmptyState from 'src/mobile/MobileEmptyState.vue';
import MobileFooter from 'src/mobile/MobileFooter.vue';
import BarcodeScanButton from 'src/mobile/scan/BarcodeScanButton.vue';
import { getItemInitials } from 'src/utils/pos';
import {
  computed,
  inject,
  onDeactivated,
  ref,
  shallowRef,
  watch,
  type Ref,
} from 'vue';
import MobilePOSCart from './MobilePOSCart.vue';
import MobilePOSLineSheet from './MobilePOSLineSheet.vue';

/** The phone POS: an item grid with a cart bar that opens the cart sheet. */
const props = defineProps<{
  items: POSItem[];
  searchTerm: string;
  totalQuantity: number;
  disablePay: boolean;
}>();

const emit = defineEmits<{
  search: [term: string, addItem?: boolean];
  addItem: [item: POSItem];
  setCustomer: [party: string];
  hold: [];
  pay: [];
}>();

const sinvDoc = inject('sinvDoc') as Ref<SalesInvoice>;
const sheet = ref<'cart' | 'line' | null>(null);
const editingRow = shallowRef<SalesInvoiceItem | null>(null);

// Sheets are teleported, so they would outlive a cached page.
onDeactivated(() => (sheet.value = null));

watch(
  () => sinvDoc.value.items?.length,
  (count) => {
    if (!count && sheet.value === 'cart') {
      sheet.value = null;
    }
  }
);

// The cart bar alone barely changes when a saved invoice is opened.
watch(sinvDoc, (doc) => {
  if (!doc.notInserted && !doc.submitted && doc.items?.length) {
    sheet.value = 'cart';
  }
});

const cartQuantities = computed(() => {
  const quantities: Record<string, number> = {};
  for (const row of sinvDoc.value.items ?? []) {
    if (row.item && !row.is_free_item) {
      quantities[row.item] =
        (quantities[row.item] ?? 0) + Math.abs(row.quantity ?? 0);
    }
  }
  return quantities;
});

const itemCountLabel = computed(() =>
  props.totalQuantity === 1 ? t`1 item` : t`${props.totalQuantity} items`
);

function onEnter(event: KeyboardEvent) {
  emit('search', (event.target as HTMLInputElement).value, true);
}

function closeCart(then: 'hold' | 'pay') {
  sheet.value = null;
  if (then === 'hold') {
    emit('hold');
    return;
  }

  emit('pay');
}

function editRow(row: SalesInvoiceItem) {
  editingRow.value = row;
  sheet.value = 'line';
}
</script>

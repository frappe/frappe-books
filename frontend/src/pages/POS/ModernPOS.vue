<template>
  <div>
    <div
      class="h-[calc(100dvh-var(--h-row-largest))] min-h-0 overflow-y-auto lg:overflow-hidden bg-surface-gray-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 p-4"
    >
      <div class="col-span-1 flex min-w-0 min-h-[36rem] w-full lg:min-h-0">
        <div class="flex min-h-0 w-full flex-col gap-3">
          <div
            class="p-4 min-h-0 flex flex-col flex-1 bg-surface-base border rounded-4 border-outline-gray-1"
          >
            <!-- Customer Search -->
            <div class="flex-none">
              <MultiLabelLink
                v-if="sinvDoc?.fieldMap"
                class="w-full"
                secondary-link="phone"
                :border="true"
                :value="sinvDoc?.party"
                :df="sinvDoc?.fieldMap.party"
                :show-clear-button="true"
                @change="(value: string) => $emit('setCustomer', value)"
              />
            </div>

            <ModernPOSSelectedItemTable
              :expanded-batch-id="expandedBatchId"
              @set-expanded-batch-id="
                (rowName) => $emit('setExpandedBatchId', rowName)
              "
              @selected-row="
                (row, field) => $emit('selectedRow', row, field)
              "
              @toggle-modal="emitEvent('toggleModal', 'Keyboard')"
            />
          </div>

          <div
            class="flex flex-col gap-4 shrink-0 bg-surface-base border rounded-4 border-outline-gray-1 p-4"
          >
            <POSOrderSummary
              :sinv-doc="sinvDoc"
              :total-quantity="totalQuantity"
              :item-discounts="itemDiscounts"
              :additional-discounts="additionalDiscounts as Money"
            />
            <POSInvoiceActions
              :profile="profile"
              :enable-returns="!!isReturnInvoiceEnabledReturn"
              :disable-pay="disablePayButton"
              :is-return="!!sinvDoc?.isReturn"
              @save="$emit('saveInvoiceAction')"
              @clear="$emit('clearValues')"
              @held="emitEvent('toggleModal', 'SavedInvoice', true)"
              @return="
                emitEvent('toggleModal', 'ReturnSalesInvoice', true)
              "
              @pay="emitEvent('handlePaymentAction')"
            />
          </div>
        </div>
      </div>

      <div
        class="bg-surface-base border rounded-4 col-span-1 relative min-w-0 min-h-[28rem] lg:min-h-0 flex flex-col border-outline-gray-1"
      >
        <div class="flex h-full min-h-0 flex-col rounded-4 p-4 col-span-5">
          <div class="flex shrink-0 flex-wrap gap-2">
            <!-- Item Search -->
            <MultiLabelLink
              class="min-w-0 flex-1 basis-48"
              secondary-link="barcode"
              third-link="itemCode"
              :option-records="searchItems"
              :df="{
                label: t`Search Item (Name, Code, or Barcode)`,
                fieldtype: 'Link',
                fieldname: 'item',
                target: 'Item',
              }"
              :border="true"
              :value="itemSearchTerm"
              :show-clear-button="true"
              :close-on-enter="true"
              @search="
                (query: string) => emitEvent('handleItemSearch', query)
              "
              @enter="
                (value: string) =>
                  emitEvent('handleItemSearch', value, true)
              "
              @change="
                (item: string) => emitEvent('handleItemSearch', item)
              "
            />

            <Link
              class="w-40 min-w-0"
              v-if="fyo.singles.AccountingSettings?.enableitemGroup"
              :df="{
                label: t`Filter by Group`,
                fieldtype: 'Link',
                fieldname: 'itemGroup',
                target: 'ItemGroup',
              }"
              :border="true"
              :show-clear-button="true"
              :value="selectedItemGroup"
              @change="(group: string) => emitEvent('setItemGroup', group)"
            />
          </div>

          <div
            v-if="!items.length"
            class="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-4 text-center"
          >
            <p class="text-lg font-medium text-ink-gray-7">
              {{ t`No items found` }}
            </p>
            <p class="text-sm text-ink-gray-5">
              {{ t`Try another search or item group.` }}
            </p>
          </div>

          <ModernPOSItemsTable
            v-else-if="tableView"
            :items="items"
            :item-qty-map="itemQuantityMap as ItemQtyMap"
            :item-visibility="itemVisibility"
            @add-item="(item: string) => emitEvent('addItem', item)"
          />

          <ItemsGrid
            v-else
            :items="items"
            @add-item="(item: POSItem) => emitEvent('addItem', item)"
          />

          <div class="flex shrink-0 flex-wrap gap-2 pt-3">
            <POSQuickActions
              :table-view="tableView"
              :sinv-doc="sinvDoc"
              :loyalty-points="loyaltyPoints"
              :loyalty-program="loyaltyProgram"
              :applied-coupons-count="appliedCouponsCount"
              @toggle-view="emitEvent('toggleView')"
              @emit-route-to-sinv-list="emitEvent('routeToSinvList')"
              @toggle-modal="
                (modalName, value) =>
                  emitEvent('toggleModal', modalName, value)
              "
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import POSOrderSummary from 'src/components/POS/POSOrderSummary.vue';
import POSInvoiceActions from 'src/components/POS/POSInvoiceActions.vue';
import { Money } from 'pesa';
import { fyo } from 'src/initFyo';
import { defineComponent, PropType } from 'vue';
import { getItem } from 'src/utils/pos';
import { Item } from 'models/baseModels/Item/Item';
import Link from 'src/components/Controls/Link.vue';
import POSQuickActions from './POSQuickActions.vue';
import { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import MultiLabelLink from 'src/components/Controls/MultiLabelLink.vue';
import { POSItem, PosEmits, ItemQtyMap } from 'src/components/POS/types';
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import ItemsGrid from 'src/components/POS/ItemsGrid.vue';
import ModernPOSItemsTable from 'src/components/POS/Modern/ModernPOSItemsTable.vue';
import ModernPOSSelectedItemTable from 'src/components/POS/Modern/ModernPOSSelectedItemTable.vue';

export default defineComponent({
  name: 'ModernPos',
  components: {
    POSOrderSummary,
    POSInvoiceActions,
    Link,
    MultiLabelLink,
    POSQuickActions,
    ItemsGrid,
    ModernPOSItemsTable,
    ModernPOSSelectedItemTable,
  },
  props: {
    tableView: Boolean,
    itemDiscounts: Money,
    disablePayButton: Boolean,
    totalQuantity: {
      type: Number,
      default: 0,
    },
    loyaltyPoints: {
      type: Number,
      default: 0,
    },
    itemSearchTerm: {
      type: String,
      default: '',
    },
    selectedItemGroup: {
      type: String,
      default: '',
    },
    loyaltyProgram: {
      type: String,
      default: '',
    },
    appliedCouponsCount: {
      type: Number,
      default: 0,
    },
    sinvDoc: {
      type: Object as PropType<SalesInvoice | undefined>,
      default: undefined,
    },
    itemQuantityMap: {
      type: Object as PropType<ItemQtyMap>,
      default: () => ({}),
    },
    items: {
      type: Array as PropType<POSItem[]>,
      default: () => [],
    },
    searchItems: {
      type: Array as PropType<POSItem[]>,
      default: () => [],
    },
    itemVisibility: {
      type: String,
      default: 'Inventory Items',
    },
    profile: {
      type: Object as PropType<POSProfile>,
      required: false,
      default: null,
    },
    expandedBatchId: {
      type: String as PropType<string | null | undefined>,
      default: undefined,
    },
  },
  emits: [
    'setExpandedBatchId',
    'addItem',
    'toggleView',
    'toggleModal',
    'setCustomer',
    'clearValues',
    'setItemGroup',
    'routeToSinvList',
    'handleItemSearch',
    'saveInvoiceAction',
    'handlePaymentAction',
    'selectedRow',
  ],
  data() {
    return {
      additionalDiscounts: fyo.pesa(0),
      itemGroupFilter: '',
    };
  },
  computed: {
    isReturnInvoiceEnabledReturn: () =>
      fyo.singles.AccountingSettings?.enableInvoiceReturns ?? undefined,
  },
  methods: {
    emitEvent(
      eventName: PosEmits,
      ...args: (string | boolean | Item | POSItem | number | Money)[]
    ) {
      this.$emit(eventName, ...args);
    },
    getItem,
  },
});
</script>

<template>
  <div>
    <div
      class="h-[calc(100dvh-var(--h-row-largest))] min-h-0 overflow-y-auto xl:overflow-hidden bg-surface-gray-1 grid grid-cols-1 xl:grid-cols-12 gap-2 p-4"
    >
      <div
        class="relative col-span-1 xl:col-span-5 min-w-0 min-h-[28rem] xl:min-h-0 overflow-hidden bg-surface-base border rounded-4 border-outline-gray-1"
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

          <ItemsTable
            v-else-if="tableView"
            :items="items"
            :item-qty-map="itemQuantityMap as ItemQtyMap"
            :item-visibility="itemVisibility"
            @add-item="(item) => emitEvent('addItem', item)"
          />

          <ItemsGrid
            v-else
            :items="items"
            @add-item="(item) => emitEvent('addItem', item)"
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

      <div
        class="col-span-1 min-w-0 min-h-[36rem] xl:col-span-7 xl:min-h-0"
      >
        <div class="flex h-full min-h-0 flex-col gap-3">
          <div
            class="p-4 bg-surface-base border rounded-4 min-h-0 flex-1 flex flex-col border-outline-gray-1"
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

            <SelectedItemTable
              :expanded-batch-id="expandedBatchId"
              @set-expanded-batch-id="
                (rowName) => $emit('setExpandedBatchId', rowName)
              "
              @selected-row="(row) => $emit('selectedRow', row)"
            />
          </div>

          <div
            class="grid shrink-0 grid-cols-1 gap-5 rounded-4 border border-outline-gray-1 bg-surface-base p-4 sm:grid-cols-2"
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
    </div>
  </div>
</template>

<script lang="ts">
import POSOrderSummary from 'src/components/POS/POSOrderSummary.vue';
import POSInvoiceActions from 'src/components/POS/POSInvoiceActions.vue';
import { Money } from 'pesa';
import { fyo } from 'src/initFyo';
import { getItem } from 'src/utils/pos';
import { defineComponent, PropType } from 'vue';
import { Item } from 'models/baseModels/Item/Item';
import POSQuickActions from './POSQuickActions.vue';
import { PosEmits } from 'src/components/POS/types';
import Link from 'src/components/Controls/Link.vue';
import { POSItem, ItemQtyMap } from 'src/components/POS/types';
import ItemsGrid from 'src/components/POS/ItemsGrid.vue';
import ItemsTable from 'src/components/POS/Classic/ItemsTable.vue';
import { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import MultiLabelLink from 'src/components/Controls/MultiLabelLink.vue';
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import SelectedItemTable from 'src/components/POS/Classic/SelectedItemTable.vue';

export default defineComponent({
  name: 'ClassicPOS',
  components: {
    POSOrderSummary,
    POSInvoiceActions,
    Link,
    ItemsGrid,
    ItemsTable,
    MultiLabelLink,
    POSQuickActions,
    SelectedItemTable,
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
      itemGroupFilter: '',
      additionalDiscounts: fyo.pesa(0),
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

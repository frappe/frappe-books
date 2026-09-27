<template>
  <div class="flex-col">
    <PageHeader :title="t`Point of Sale`">
      <slot>
        <Button
          @click="toggleModal('ShiftClose')"
        >
          <span>{{ t`Close POS Shift` }}</span>
        </Button>
      </slot>
    </PageHeader>
    <component :is="layout === 'Classic' ? 'ClassicPOS' : 'ModernPOS'">
      <template #items>
        <POSItemPicker
          :items="filteredItems as POSItem[]"
          :search-items="items as POSItem[]"
          :search-term="itemSearchTerm"
          :item-group="selectedItemGroup"
          :table-view="tableView"
          :split="layout === 'Modern'"
          @search="handleItemSearch"
          @set-item-group="setItemGroup"
          @add-item="addItem"
        />
        <div class="flex shrink-0 flex-wrap gap-2 pt-3">
          <POSQuickActions
            :table-view="tableView"
            :sinv-doc="sinvDoc as SalesInvoice"
            :loyalty-points="loyaltyPoints"
            :loyalty-program="loyaltyProgram"
            :applied-coupons-count="appliedCouponsCount"
            @toggle-view="toggleView"
            @emit-route-to-sinv-list="routeToSinvList"
            @toggle-modal="toggleModal"
          />
        </div>
      </template>

      <template #cart>
        <div class="flex-none">
          <MultiLabelLink
            v-if="sinvDoc.fieldMap"
            class="w-full"
            secondary-link="phone"
            :border="true"
            :value="sinvDoc.party"
            :df="sinvDoc.fieldMap.party"
            :show-clear-button="true"
            @change="setCustomer"
          />
        </div>
        <SelectedItemTable
          v-if="layout === 'Classic'"
          :expanded-batch-id="expandedBatchId"
          @set-expanded-batch-id="setExpandedBatchId"
          @selected-row="selectRow"
        />
        <ModernPOSSelectedItemTable
          v-else
          :expanded-batch-id="expandedBatchId"
          @set-expanded-batch-id="setExpandedBatchId"
          @selected-row="selectRow"
          @toggle-modal="toggleModal('Keyboard')"
        />
      </template>

      <template #summary>
        <POSOrderSummary
          :sinv-doc="sinvDoc as SalesInvoice"
          :total-quantity="totalQuantity"
          :item-discounts="itemDiscounts as Money"
        />
        <POSInvoiceActions
          :profile="posProfile as POSProfile"
          :enable-returns="enableReturns"
          :disable-pay="disablePayButton"
          :is-return="!!sinvDoc.isReturn"
          @save="saveInvoiceAction"
          @clear="clearValues"
          @held="toggleModal('SavedInvoice', true)"
          @return="toggleModal('ReturnSalesInvoice', true)"
          @pay="handlePaymentAction"
        />
      </template>
    </component>

    <OpenPOSShiftModal
      v-if="!isPosShiftOpen"
      :open-modal="!isPosShiftOpen"
      @toggle-modal="toggleModal('ShiftOpen')"
    />
    <ClosePOSShiftModal
      :open-modal="openShiftCloseModal"
      @toggle-modal="toggleModal('ShiftClose', false)"
    />
    <LoyaltyProgramModal
      :open-modal="openLoyaltyProgramModal"
      :loyalty-points="loyaltyPoints"
      :loyalty-program="loyaltyProgram"
      @toggle-modal="toggleModal('LoyaltyProgram', false)"
      @set-loyalty-points="setLoyaltyPoints"
    />
    <BatchSelectionModal
      :open-modal="openBatchSelectionModal"
      :item-code="selectedItemForBatch"
      @toggle-modal="toggleModal('BatchSelection', false)"
      @batch-selected="handleBatchSelected"
    />
    <SavedInvoiceModal
      :open-modal="openSavedInvoiceModal"
      @toggle-modal="toggleModal('SavedInvoice', false)"
      @selected-invoice-name="selectedInvoiceName"
    />
    <CouponCodeModal
      :open-modal="openCouponCodeModal"
      @toggle-modal="toggleModal('CouponCode', false)"
      @set-coupons-count="setCouponsCount"
    />
    <PriceListModal
      :open-modal="openPriceListModal"
      @toggle-modal="toggleModal('PriceList', false)"
    />
    <ItemEnquiryModal
      :open-modal="openItemEnquiryModal"
      :customer="sinvDoc.party"
      @toggle-modal="toggleModal('ItemEnquiry', false)"
    />
    <PaymentModal
      :open-modal="openPaymentModal"
      @toggle-modal="toggleModal('Payment', false)"
      @set-paid-amount="setPaidAmount"
      @set-payment-method="setPaymentMethod"
      @set-transfer-ref-no="setTransferRefNo"
      @set-transfer-clearance-date="setTransferClearanceDate"
      @create-transaction="createTransaction"
    />
    <ReturnSalesInvoiceModal
      :open-modal="openReturnSalesInvoiceModal"
      @selected-return-invoice="selectedReturnInvoice"
      @toggle-modal="toggleModal('ReturnSalesInvoice', false)"
    />
    <AlertModal
      :open-modal="openAlertModal"
      @toggle-modal="toggleModal('Alert', false)"
      @save-and-continue="handleSaveAndContinue"
    />
    <KeyboardModal
      v-if="selectedRow && keyboardField"
      :modal-status="openKeyboardModal"
      :selected-item-field="keyboardField"
      :selected-item-row="selectedRow as SalesInvoiceItem"
      @toggle-modal="toggleModal('Keyboard', false)"
    />
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import { Money } from 'pesa';
import { fyo } from 'src/initFyo';
import ModernPOS from './ModernPOS.vue';
import ClassicPOS from './ClassicPOS.vue';
import POSQuickActions from './POSQuickActions.vue';
import MultiLabelLink from 'src/components/Controls/MultiLabelLink.vue';
import POSItemPicker from 'src/components/POS/POSItemPicker.vue';
import POSOrderSummary from 'src/components/POS/POSOrderSummary.vue';
import POSInvoiceActions from 'src/components/POS/POSInvoiceActions.vue';
import SelectedItemTable from 'src/components/POS/Classic/SelectedItemTable.vue';
import ModernPOSSelectedItemTable from 'src/components/POS/Modern/ModernPOSSelectedItemTable.vue';
import AlertModal from './AlertModal.vue';
import PaymentModal from './PaymentModal.vue';
import KeyboardModal from './KeyboardModal.vue';
import PriceListModal from './PriceListModal.vue';
import CouponCodeModal from './CouponCodeModal.vue';
import ItemEnquiryModal from './ItemEnquiryModal.vue';
import SavedInvoiceModal from './SavedInvoiceModal.vue';
import OpenPOSShiftModal from './OpenPOSShiftModal.vue';
import ClosePOSShiftModal from './ClosePOSShiftModal.vue';
import BatchSelectionModal from './BatchSelectionModal.vue';
import LoyaltyProgramModal from './LoyaltyProgramModal.vue';
import ReturnSalesInvoiceModal from './ReturnSalesInvoiceModal.vue';
import { ModelNameEnum } from 'models/types';
import Button from 'src/components/Button.vue';
import { showToast } from 'src/utils/interactive';
import { Item } from 'models/baseModels/Item/Item';
import { Shipment } from 'models/inventory/Shipment';
import { routeTo, toggleSidebar } from 'src/utils/ui';
import { shortcutsKey } from 'src/utils/injectionKeys';
import PageHeader from 'src/components/PageHeader.vue';
import { computed, defineComponent, inject, nextTick } from 'vue';
import { Payment } from 'models/baseModels/Payment/Payment';
import { PaymentMethod } from 'models/baseModels/PaymentMethod/PaymentMethod';
import { getPaymentMethodRequirements } from 'models/baseModels/PaymentMethod/requirements';
import { ModalName, modalNames } from 'src/components/POS/types';
import { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import { InvoiceItem } from 'models/baseModels/InvoiceItem/InvoiceItem';
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { SalesInvoiceItem } from 'models/baseModels/SalesInvoiceItem/SalesInvoiceItem';
import { AppliedCouponCodes } from 'models/baseModels/AppliedCouponCodes/AppliedCouponCodes';
import {
  addBatchItem,
  validatePOSCheckout,
  getTotalQuantity,
  getTotalTaxedAmount,
  validateIsPosSettingsSet,
} from 'src/utils/pos';
import {
  validateQty,
  getItemQtyMap,
  getItemVisibility,
  getMappedDoc,
} from 'models/helpers';
import {
  POSItem,
  ItemQtyMap,
  ItemSerialNumbers,
} from 'src/components/POS/types';
import { ValidationError } from 'fyo/utils/errors';
import { getExistingActiveSerialNumbersForItem } from 'models/inventory/helpers';
import { filterPOSItems, findExactPOSItem } from 'src/utils/posItemSearch';
import { getPOSInventory } from 'models/inventory/posStock';

const COMPONENT_NAME = 'POS';

export default defineComponent({
  name: 'POS',
  components: {
    Button,
    ModernPOS,
    PageHeader,
    ClassicPOS,
    POSQuickActions,
    MultiLabelLink,
    POSItemPicker,
    POSOrderSummary,
    POSInvoiceActions,
    SelectedItemTable,
    ModernPOSSelectedItemTable,
    AlertModal,
    PaymentModal,
    KeyboardModal,
    PriceListModal,
    CouponCodeModal,
    ItemEnquiryModal,
    SavedInvoiceModal,
    OpenPOSShiftModal,
    ClosePOSShiftModal,
    BatchSelectionModal,
    LoyaltyProgramModal,
    ReturnSalesInvoiceModal,
  },
  provide() {
    return {
      doc: computed(() => this.sinvDoc),
      sinvDoc: computed(() => this.sinvDoc),
      coupons: computed(() => this.coupons),
      itemQtyMap: computed(() => this.itemQtyMap),
      paidAmount: computed(() => this.paidAmount),
      paymentMethod: computed(() => this.paymentMethod),
      transferRefNo: computed(() => this.transferRefNo),
      itemDiscounts: computed(() => this.itemDiscounts),
      transferAmount: computed(() => this.transferAmount),
      appliedCoupons: computed(() => this.sinvDoc.coupons ?? []),
      totalTaxedAmount: computed(() => this.totalTaxedAmount),
      itemSerialNumbers: computed(() => this.itemSerialNumbers),
      isDiscountingEnabled: computed(() => this.isDiscountingEnabled),
      transferClearanceDate: computed(() => this.transferClearanceDate),
      posSettings: computed(() => fyo.singles.POSSettings),
    };
  },
  setup() {
    return {
      shortcuts: inject(shortcutsKey),
    };
  },
  data() {
    return {
      tableView: true,

      items: [] as POSItem[],

      openAlertModal: false,
      openPaymentModal: false,
      openKeyboardModal: false,
      openPriceListModal: false,
      openItemEnquiryModal: false,
      openCouponCodeModal: false,
      openShiftCloseModal: false,
      openSavedInvoiceModal: false,
      openLoyaltyProgramModal: false,
      openAppliedCouponsModal: false,
      openReturnSalesInvoiceModal: false,
      openBatchSelectionModal: false,
      isPosShiftOpen: false,

      totalQuantity: 0,
      paidAmount: fyo.pesa(0),
      itemDiscounts: fyo.pesa(0),
      transferAmount: fyo.pesa(0),
      totalTaxedAmount: fyo.pesa(0),
      additionalDiscounts: fyo.pesa(0),

      loyaltyPoints: 0,
      appliedLoyaltyPoints: 0,
      loyaltyProgram: '' as string,

      appliedCouponsCount: 0,
      appliedCoupons: [] as AppliedCouponCodes[],

      itemSearchTerm: '',
      selectedItemGroup: '',
      paymentMethod: undefined as string | undefined,
      transferRefNo: undefined as string | undefined,
      defaultCustomer: undefined as string | undefined,
      transferClearanceDate: undefined as Date | undefined,

      paymentDoc: {} as Payment,
      sinvDoc: {} as SalesInvoice,
      posProfile: null as POSProfile | null,
      itemQtyMap: {} as ItemQtyMap,
      coupons: {} as AppliedCouponCodes,
      itemSerialNumbers: {} as ItemSerialNumbers,
      quickQtyActive: false,
      quickQtyBuffer: '' as string,
      selectedRow: null as SalesInvoiceItem | null,
      keyboardField: '',
      quickQtyKeyDownHandler: null as ((e: KeyboardEvent) => void) | null,
      quickQtyKeyUpHandler: null as ((e: KeyboardEvent) => void) | null,
      selectedItemForBatch: '' as string,
      pendingBatchItem: null as { item: POSItem; quantity: number } | null,
      expandedBatchId: undefined as string | null | undefined,
    };
  },
  computed: {
    layout(): 'Classic' | 'Modern' {
      const posUI =
        this.posProfile?.posUI || fyo.singles.POSSettings?.posUI;
      return posUI === 'Classic' ? 'Classic' : 'Modern';
    },
    defaultPOSCashAccount: () =>
      fyo.singles.POSSettings?.cashAccount ?? undefined,
    isDiscountingEnabled(): boolean {
      return !!fyo.singles.AccountingSettings?.enableDiscounting;
    },
    enableReturns(): boolean {
      return !!fyo.singles.AccountingSettings?.enableInvoiceReturns;
    },
    filteredItems() {
      return filterPOSItems(this.items, this.itemSearchTerm);
    },
    disablePayButton(): boolean {
      if (!this.sinvDoc.items?.length || !this.sinvDoc.party) {
        return true;
      }

      return false;
    },
  },
  watch: {
    sinvDoc: {
      handler() {
        if (this.sinvDoc.coupons?.length) {
          this.setCouponsCount(this.sinvDoc.coupons?.length);
        }

        this.updateValues();
      },
      deep: true,
    },
  },

  async mounted() {
    await this.setIsPosShiftOpen();
    await this.loadPOSProfile();
    this.setCouponCodeDoc();
    this.setSinvDoc();
    this.setDefaultCustomer();
    await this.setItemQtyMap();
    await this.setItems();
  },
  async activated() {
    toggleSidebar(false);
    validateIsPosSettingsSet(fyo);
    await this.setIsPosShiftOpen();
    await this.loadPOSProfile();
    this.setCouponCodeDoc();
    this.setSinvDoc();
    this.setDefaultCustomer();
    this.setShortcuts();
    this.addQuickQtyListeners();

    await this.setItemQtyMap();
    await this.setItems();
  },
  async beforeRouteLeave() {
    this.closeAllModals();
    await nextTick();
  },
  deactivated() {
    this.shortcuts?.delete(COMPONENT_NAME);
    toggleSidebar(true);
    this.removeQuickQtyListeners();
    this.closeAllModals();
  },
  methods: {
    selectRow(row: SalesInvoiceItem, field = '') {
      this.selectedRow = row;
      this.keyboardField = field;
    },
    setExpandedBatchId(rowName: string | null) {
      this.expandedBatchId = rowName;
    },
    addQuickQtyListeners() {
      this.quickQtyKeyDownHandler = (e: KeyboardEvent) =>
        this.onQuickQtyKeyDown(e);
      this.quickQtyKeyUpHandler = (e: KeyboardEvent) => this.onQuickQtyKeyUp(e);
      window.addEventListener(
        'keydown',
        this.quickQtyKeyDownHandler as EventListener
      );
      window.addEventListener(
        'keyup',
        this.quickQtyKeyUpHandler as EventListener
      );
    },
    removeQuickQtyListeners() {
      if (this.quickQtyKeyDownHandler) {
        window.removeEventListener(
          'keydown',
          this.quickQtyKeyDownHandler as EventListener
        );
        this.quickQtyKeyDownHandler = null;
      }
      if (this.quickQtyKeyUpHandler) {
        window.removeEventListener(
          'keyup',
          this.quickQtyKeyUpHandler as EventListener
        );
        this.quickQtyKeyUpHandler = null;
      }
    },
    hasAnyOpenModal(): boolean {
      return (
        this.openAlertModal ||
        this.openPaymentModal ||
        this.openBatchSelectionModal ||
        this.openKeyboardModal ||
        this.openPriceListModal ||
        this.openItemEnquiryModal ||
        this.openCouponCodeModal ||
        this.openShiftCloseModal ||
        this.openSavedInvoiceModal ||
        this.openLoyaltyProgramModal ||
        this.openAppliedCouponsModal ||
        this.openReturnSalesInvoiceModal
      );
    },
    onQuickQtyKeyDown(e: KeyboardEvent) {
      // Ignore if focus is in an input/contentEditable without modifiers
      const notMods = !(e.altKey || e.metaKey || e.ctrlKey);
      const target = e.target as HTMLElement | null;
      if (
        target &&
        notMods &&
        ((target instanceof HTMLInputElement && target.type !== 'button') ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable)
      ) {
        return;
      }

      // Only active on POS page with no modal open
      if (this.hasAnyOpenModal()) {
        return;
      }

      if (e.code === 'KeyQ' && !this.quickQtyActive) {
        this.quickQtyActive = true;
        this.quickQtyBuffer = '';
        return;
      }

      if (!this.quickQtyActive) {
        return;
      }

      // While holding Q, collect digits; support both main digits and numpad
      if (/^Digit[0-9]$/.test(e.code)) {
        this.quickQtyBuffer += e.code.replace('Digit', '');
        e.preventDefault();
        return;
      }

      if (/^Numpad[0-9]$/.test(e.code)) {
        this.quickQtyBuffer += e.code.replace('Numpad', '');
        e.preventDefault();
        return;
      }

      if (e.code === 'Backspace') {
        this.quickQtyBuffer = this.quickQtyBuffer.slice(0, -1);
        e.preventDefault();
        return;
      }
    },
    async onQuickQtyKeyUp(e: KeyboardEvent) {
      if (e.code !== 'KeyQ' || !this.quickQtyActive) {
        return;
      }

      this.quickQtyActive = false;

      const buffer = this.quickQtyBuffer;
      this.quickQtyBuffer = '';

      if (!buffer || !buffer.length) {
        return;
      }

      const qty = Number(buffer);
      if (!Number.isFinite(qty)) {
        return;
      }

      // Determine target row: prefer explicitly selected row; else fallback to last non-free item
      let row = this.selectedRow as SalesInvoiceItem | null;
      if (!row || !(this.sinvDoc.items || []).includes(row)) {
        const items = (this.sinvDoc.items || []).filter((r) => !r.isFreeItem);
        row = items.length
          ? (items[items.length - 1] as SalesInvoiceItem)
          : null;
      }

      if (!row) {
        return;
      }

      // Validate and recalculate similar to keyboard modal quantity change.
      const isUOMConversionEnabled =
        !!this.fyo.singles.InventorySettings?.enableUomConversions;
      const quantityField = isUOMConversionEnabled
        ? 'transferQuantity'
        : 'quantity';
      const previousQuantity = row.quantity ?? 1;
      const previousTransferQuantity = row.transferQuantity ?? previousQuantity;
      const previousFieldQuantity = isUOMConversionEnabled
        ? previousTransferQuantity
        : previousQuantity;

      if (!row.isReturn && qty <= 0) {
        showToast({
          type: 'error',
          message: t`Quantity must be greater than zero.`,
          duration: 'short',
        });
        return;
      }

      try {
        await row.set(quantityField, qty);

        const existingItems = (this.sinvDoc.items || []).filter(
          (invoiceItem) =>
            (invoiceItem as InvoiceItem).item === row.item &&
            !(invoiceItem as InvoiceItem).isFreeItem
        ) as InvoiceItem[];

        await validateQty(
          this.sinvDoc as SalesInvoice,
          row,
          existingItems as unknown as InvoiceItem[]
        );
      } catch (error) {
        row.quantity = previousQuantity;
        row.transferQuantity = previousTransferQuantity;
        await row.set(quantityField, previousFieldQuantity);
        showToast({
          type: 'error',
          message: t`${error as string}`,
          duration: 'short',
        });
        return;
      }

      if (!row.isFreeItem) {
        await this.previewInvoice();
        await this.sinvDoc.runFormulas();
      }
    },
    async setCustomer(value: string) {
      if (!value) {
        this.sinvDoc.party = '';
        return;
      }

      this.sinvDoc.party = value;

      const party = await this.fyo.db.getAll(ModelNameEnum.Party, {
        fields: ['loyaltyProgram', 'loyaltyPoints'],
        filters: { name: value },
      });

      this.loyaltyProgram = party[0]?.loyaltyProgram as string;
      this.loyaltyPoints = party[0]?.loyaltyPoints as number;
    },

    async loadPOSProfile() {
      const posProfileName = fyo.singles.POSSettings?.posProfile;

      if (!posProfileName) {
        return;
      }

      this.posProfile = (await fyo.doc.getDoc(
        ModelNameEnum.POSProfile,
        posProfileName as string
      )) as POSProfile;
    },

    async handleItemSearch(searchTerm: string | null, addItem?: boolean) {
      searchTerm ??= '';
      this.itemSearchTerm = searchTerm;
      if (!addItem) return;

      let quantity = 1;
      const posSettings = fyo.singles.POSSettings;
      const isWeightEnabledBarcode = posSettings?.weightEnabledBarcode;

      const checkDigits = posSettings?.checkDigits || '';
      const itemCodeDigits = posSettings?.itemCodeDigits || 0;
      const weightDigits = posSettings?.itemWeightDigits || 0;

      const expectedWeightBarcodeLength =
        String(checkDigits).length +
        Number(itemCodeDigits) +
        Number(weightDigits);

      let isWeightBarcode = false;
      let itemCode = searchTerm;
      let weightPart = '';

      if (
        isWeightEnabledBarcode &&
        searchTerm.startsWith(String(checkDigits)) &&
        searchTerm.length === expectedWeightBarcodeLength
      ) {
        const extractedItemCode = searchTerm.slice(
          checkDigits.toString().length,
          checkDigits.toString().length + itemCodeDigits
        );
        const weightData = searchTerm.slice(
          checkDigits.toString().length + itemCodeDigits
        );

        if (!isNaN(Number(weightData))) {
          isWeightBarcode = true;
          itemCode = extractedItemCode;
          weightPart = weightData;
        }
      }

      const allItems = this.items;

      let matchedItem = null;

      if (isWeightBarcode) {
        matchedItem = allItems.find(
          (item) => item.itemCode === itemCode || item.barcode === itemCode
        );
      } else if (searchTerm.length === 12) {
        matchedItem = allItems.find((item) => item.barcode === searchTerm);
      }

      matchedItem ??= findExactPOSItem(allItems, searchTerm);

      if (!matchedItem) return;

      if (isWeightBarcode && weightPart) {
        const weightValue = parseInt(weightPart, 10);
        if (matchedItem.unit?.toLowerCase() === 'kg') {
          quantity = weightValue / 1000;
        } else {
          quantity = weightValue;
        }
      }

      if (addItem) {
        await this.addItem(matchedItem as POSItem, quantity);
        this.itemSearchTerm = '';
      }
    },

    getItem(name: string) {
      return this.items.find((item) => item.name === name);
    },

    isModalOpen() {
      for (const modal of modalNames) {
        if (modal && this[`open${modal}Modal`]) {
          this[`open${modal}Modal`] = false;
          return `open${modal}Modal`;
        }
      }
    },
    setShortcuts() {
      this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyS'], async () => {
        await this.routeToSinvList();
      });

      this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyV'], () => {
        this.toggleView();
      });

      this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyP'], () => {
        this.toggleModal('PriceList', true);
      });

      this.shortcuts?.pmodShift.set(COMPONENT_NAME, ['KeyH'], () => {
        this.toggleModal('SavedInvoice', true);
      });

      this.shortcuts?.pmodShift.set(COMPONENT_NAME, ['Backspace'], async () => {
        const modalStatus = this.isModalOpen();

        if (!modalStatus) {
          await this.clearValues();
        }
      });

      this.shortcuts?.pmodShift.set(COMPONENT_NAME, ['KeyP'], () => {
        if (!this.disablePayButton) {
          this.toggleModal('Payment', true);
        }
      });

      this.shortcuts?.pmodShift.set(COMPONENT_NAME, ['KeyS'], async () => {
        const modalStatus = this.isModalOpen();

        if (!modalStatus && this.sinvDoc.party && this.sinvDoc.items?.length) {
          await this.saveOrder();
        }
      });

      this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyL'], () => {
        if (
          this.fyo.singles.AccountingSettings?.enablePriceList &&
          this.loyaltyPoints &&
          this.sinvDoc.party &&
          this.sinvDoc.items?.length &&
          this.loyaltyProgram
        ) {
          this.toggleModal('LoyaltyProgram', true);
        }
      });

      this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyC'], () => {
        if (
          this.fyo.singles.AccountingSettings?.enableCouponCode &&
          this.sinvDoc?.party &&
          this.sinvDoc?.items?.length
        ) {
          this.toggleModal('CouponCode', true);
        }
      });
    },
    async saveOrder() {
      try {
        await this.validate();
        await this.sinvDoc.runFormulas();
        await this.sinvDoc.sync();
      } catch (error) {
        return showToast({
          type: 'error',
          message: t`${error as string}`,
        });
      }

      showToast({
        type: 'success',
        message: t`Sales Invoice ${this.sinvDoc.name as string} is Saved`,
        duration: 'short',
      });

      const savedDoc = this.sinvDoc as SalesInvoice;
      try {
        await this.afterSync();
      } catch (error) {
        this.fyo.reportDocumentActionWarning(savedDoc, 'save', [error]);
      }
    },
    async setItemGroup(itemGroupName: string) {
      this.selectedItemGroup = itemGroupName;
      await this.setItems();
    },
    async setItems() {
      const filters: Record<string, boolean | string> = {};
      const itemVisibility = await getItemVisibility(this.fyo);

      const hideUnavailable =
        this.posProfile?.hideUnavailableItems ??
        this.fyo.singles.POSSettings?.hideUnavailableItems;

      if (itemVisibility === 'Inventory Items') {
        filters.trackItem = true;
      } else if (itemVisibility === 'Non-Inventory Items') {
        filters.trackItem = false;
      }

      if (this.selectedItemGroup) {
        filters.itemGroup = this.selectedItemGroup;
      }

      const items = (await fyo.db.getAll(ModelNameEnum.Item, {
        fields: [],
        filters: filters,
      })) as Item[];

      this.items = [] as POSItem[];
      for (const item of items) {
        let availableQty = 0;

        if (!!this.itemQtyMap[item.name as string]) {
          availableQty = this.itemQtyMap[item.name as string].availableQty;
        }

        if (!item.name) {
          return;
        }
        if (hideUnavailable && filters.trackItem && availableQty <= 0) {
          continue;
        }

        this.items.push({
          availableQty,
          name: item.name,
          itemCode: item.itemCode as string,
          barcode: item.barcode as string,
          image: item?.image as string,
          rate: item.rate as Money,
          unit: item.unit as string,
          hasBatch: !!item.hasBatch,
          hasSerialNumber: !!item.hasSerialNumber,
        });
      }
    },
    async selectedReturnInvoice(invoiceName: string) {
      const salesInvoiceDoc = (await this.fyo.doc.getDoc(
        ModelNameEnum.SalesInvoice,
        invoiceName
      )) as SalesInvoice;

      this.sinvDoc = (await getMappedDoc(
        salesInvoiceDoc,
        ModelNameEnum.SalesInvoice,
        'make_return'
      )) as SalesInvoice;
    },
    toggleView() {
      this.tableView = !this.tableView;
    },
    setPaidAmount(amount: Money) {
      this.paidAmount = this.fyo.pesa(amount.toString());
    },
    setPaymentMethod(method: string) {
      this.paymentMethod = method;
    },
    setDefaultCustomer() {
      this.defaultCustomer =
        this.posProfile?.posCustomer ??
        this.fyo.singles.Defaults?.posCustomer ??
        '';
      this.sinvDoc.party = this.defaultCustomer;
    },
    setItemDiscounts() {
      this.itemDiscounts = (this.sinvDoc as SalesInvoice).itemDiscount;
    },
    async setItemQtyMap() {
      this.itemQtyMap = await getItemQtyMap(this.sinvDoc as SalesInvoice);
    },
    setSinvDoc() {
      this.sinvDoc = this.fyo.doc.getNewDoc(ModelNameEnum.SalesInvoice, {
        account: this.fyo.singles.POSSettings?.defaultAccount,
        party: this.sinvDoc.party ?? this.defaultCustomer,
        isPOS: true,
      }) as SalesInvoice;
    },
    setCouponCodeDoc() {
      this.coupons = this.fyo.doc.getNewDoc(
        ModelNameEnum.AppliedCouponCodes
      ) as AppliedCouponCodes;
    },
    setAppliedCoupons() {
      this.appliedCoupons = this.sinvDoc.coupons as AppliedCouponCodes[];
    },
    setTotalQuantity() {
      this.totalQuantity = getTotalQuantity(
        this.sinvDoc.items as SalesInvoiceItem[]
      );
    },
    ignorePricingRules(): boolean {
      return !!(
        this.posProfile?.ignorePricingRule ??
        this.fyo.singles.POSSettings?.ignorePricingRule
      );
    },
    setTotalTaxedAmount() {
      this.totalTaxedAmount = getTotalTaxedAmount(this.sinvDoc as SalesInvoice);
    },
    setCouponsCount(value: number) {
      this.appliedCouponsCount = value;
    },
    async setLoyaltyPoints(value: number) {
      this.appliedLoyaltyPoints = value;
      await this.sinvDoc.set('redeemLoyaltyPoints', value > 0);
      await this.previewInvoice();
    },
    async selectedInvoiceName(doc: SalesInvoice) {
      const salesInvoiceDoc = (await this.fyo.doc.getDoc(
        ModelNameEnum.SalesInvoice,
        doc.name
      )) as SalesInvoice;

      this.sinvDoc = salesInvoiceDoc;
      this.toggleModal('SavedInvoice', false);

      if (doc.submitted) {
        this.toggleModal('Payment');
      }
    },
    setTransferAmount(amount: Money = fyo.pesa(0)) {
      this.transferAmount = amount;
    },
    setTransferClearanceDate(date: Date) {
      this.transferClearanceDate = date;
    },
    setTransferRefNo(ref: string) {
      this.transferRefNo = ref;
    },
    validateInvoice() {
      if (this.sinvDoc.isSubmitted) {
        throw new ValidationError(
          t`Cannot add an item to a submitted invoice.`
        );
      }

      if (this.sinvDoc.returnAgainst) {
        throw new ValidationError(
          t`Unable to add an item to the return invoice.`
        );
      }
    },
    async assignActiveSerialNumbers(
      itemName: string,
      quantity: number,
      row: Pick<InvoiceItem, 'set'>
    ) {
      const serialNumbers = await getExistingActiveSerialNumbersForItem(
        this.fyo,
        itemName,
        quantity
      );

      if (!serialNumbers) {
        return;
      }

      this.itemSerialNumbers[itemName] = serialNumbers;
      await row.set('serialNumber', serialNumbers);
    },
    async addItem(item: POSItem | undefined, quantity?: number) {
      try {
        await this.sinvDoc.runFormulas();
        this.validateInvoice();

        if (!item) {
          return;
        }

        const itemName = item.name;
        const storedHasBatch = await this.fyo.getValue(
          ModelNameEnum.Item,
          itemName,
          'hasBatch'
        );
        const hasBatch = !!item.hasBatch || !!storedHasBatch;

        if (hasBatch) {
          this.selectedItemForBatch = itemName;
          this.pendingBatchItem = { item, quantity: quantity ?? 1 };

          this.toggleModal('BatchSelection', true);
          return;
        }

        const isInventoryItem = await this.fyo.getValue(
          ModelNameEnum.Item,
          itemName,
          'trackItem'
        );

        if (isInventoryItem) {
          const availableQty = this.itemQtyMap[itemName]?.availableQty ?? 0;
          if (availableQty <= 0) {
            throw new ValidationError(
              t`Item ${itemName} is out of stock (quantity is zero)`
            );
          }
        }

        const existingItems =
          this.sinvDoc.items?.filter(
            (invoiceItem) =>
              invoiceItem.item === itemName && !invoiceItem.isFreeItem
          ) ?? [];

        const itemsHsncode = (await this.fyo.getValue(
          'Item',
          itemName,
          'hsnCode'
        )) as number;

        if (hasBatch) {
          const addQty = quantity ?? 1;

          if (existingItems.length > 0) {
            for (let existingItem of existingItems) {
              const availableQty = await this.fyo.db.getStockQuantity(
                existingItem.item as string,
                undefined,
                undefined,
                undefined,
                existingItem.batch
              );
              if (
                existingItem.batch != null &&
                availableQty != null &&
                availableQty > (existingItem.quantity as number)
              ) {
                const currentQty = existingItem.quantity ?? 0;
                await existingItem.set('quantity', currentQty + addQty);

                await this.assignActiveSerialNumbers(
                  itemName,
                  currentQty + addQty,
                  existingItem
                );

                await this.previewInvoice();
                await this.sinvDoc.runFormulas();
                return;
              }
            }
          }

          await this.sinvDoc.append('items', {
            item: itemName,
            quantity: addQty,
            transferQuantity: addQty,
            transferUnit: item.unit,
            hsnCode: itemsHsncode,
          });

          const newItemRows = this.sinvDoc.items?.filter(
            (row) => row.item === itemName && !row.isFreeItem
          );
          if (newItemRows?.length) {
            await this.assignActiveSerialNumbers(
              itemName,
              addQty,
              newItemRows[newItemRows.length - 1]
            );
          }

          await this.previewInvoice();
          await this.sinvDoc.runFormulas();
          return;
        }

        if (existingItems.length) {
          const currentQty = existingItems[0].quantity ?? 0;
          const addQty = quantity ?? 1;
          if (isInventoryItem) {
            const availableQty = this.itemQtyMap[itemName]?.availableQty ?? 0;
            if (currentQty + addQty > availableQty) {
              throw new ValidationError(
                `Cannot add more than the available quantity for ${itemName}`
              );
            }
          }

          await existingItems[0].set('quantity', currentQty + addQty);
          await this.assignActiveSerialNumbers(
            itemName,
            currentQty + addQty,
            existingItems[0]
          );

          await this.previewInvoice();
          await this.sinvDoc.runFormulas();
          return;
        }

        await this.sinvDoc.append('items', {
          item: itemName,
          quantity: quantity ?? 1,
          transferQuantity: quantity ?? 1,
          transferUnit: item.unit,
          hsnCode: itemsHsncode,
        });

        const newItemRows = this.sinvDoc.items?.filter(
          (row) => row.item === itemName && !row.isFreeItem
        );
        if (newItemRows?.length) {
          await this.assignActiveSerialNumbers(
            itemName,
            quantity ?? 1,
            newItemRows[newItemRows.length - 1]
          );
        }

        await this.previewInvoice();
        await this.sinvDoc.runFormulas();
      } catch (error) {
        return showToast({
          type: 'error',
          message: t`${error as string}`,
        });
      }
    },
    async handleBatchSelected(batchName: string) {
      if (!this.pendingBatchItem) {
        return;
      }

      const { item, quantity } = this.pendingBatchItem;
      this.pendingBatchItem = null;

      try {
        await this.setItemQtyMap();
        await this.setItems();
        await addBatchItem(
          this.sinvDoc as SalesInvoice,
          item as POSItem,
          batchName,
          quantity ?? 1,
          this.itemQtyMap
        );
        await this.previewInvoice();
        await this.sinvDoc.runFormulas();
      } catch (error) {
        showToast({
          type: 'error',
          message: t`${error as string}`,
        });
      }
    },

    async createTransaction(shouldPrint = false, isPay = false) {
      try {
        if (isPay) {
          await this.validatePaymentDetails();
        }

        this.sinvDoc.date = new Date();
        await this.validate();
        if (!this.sinvDoc.isSubmitted) {
          await this.submitSinvDoc();
        }

        const itemVisibility = await getItemVisibility(this.fyo);

        if (
          this.sinvDoc.stockNotTransferred &&
          itemVisibility === 'Inventory Items'
        ) {
          await this.makeStockTransfer();
        }

        if (isPay) {
          await this.makePayment();
        }

        this.closeAllModals();
        await nextTick();

        if (shouldPrint) {
          await routeTo(
            `/print/${this.sinvDoc.schemaName}/${this.sinvDoc.name}`
          );
        }

        await this.afterTransaction();
        await this.setItems();
      } catch (error) {
        showToast({
          type: 'error',
          message: t`${error as string}`,
        });
      }
    },
    async validatePaymentDetails() {
      if (!this.paymentMethod) {
        throw new ValidationError(
          t`Please select a payment method before proceeding with payment.`
        );
      }

      const paidAmount = this.fyo.pesa(this.paidAmount.float).abs();
      const outstandingAmount = (
        this.sinvDoc.outstandingAmount?.isZero()
          ? this.sinvDoc.grandTotal
          : this.sinvDoc.outstandingAmount
      )?.abs();

      if (paidAmount.isZero()) {
        throw new ValidationError(t`Please enter an amount greater than zero.`);
      }

      const paymentMethod = (await this.fyo.doc.getDoc(
        ModelNameEnum.PaymentMethod,
        this.paymentMethod
      )) as PaymentMethod;
      const requirements = getPaymentMethodRequirements(
        paymentMethod.type,
        paymentMethod.requiresClearanceDate
      );

      if (requirements.isCash) {
        return;
      }

      if (outstandingAmount && paidAmount.gt(outstandingAmount)) {
        throw new ValidationError(
          t`Non-cash payment amount cannot exceed the outstanding amount.`
        );
      }

      if (requirements.requiresReferenceId && !this.transferRefNo) {
        throw new ValidationError(t`Please enter a reference number.`);
      }

      if (requirements.requiresClearanceDate && !this.transferClearanceDate) {
        throw new ValidationError(t`Please select a clearance date.`);
      }
    },
    async makePayment() {
      if (this.sinvDoc.outstandingAmount?.isZero()) {
        return;
      }

      this.paymentDoc = (await getMappedDoc(
        this.sinvDoc as SalesInvoice,
        ModelNameEnum.Payment,
        'make_payment'
      )) as Payment;

      const paymentMethod = this.paymentMethod;
      const tenderedAmount = this.fyo.pesa(this.paidAmount.float).abs();
      const outstandingAmount = (
        this.sinvDoc.outstandingAmount ?? this.sinvDoc.grandTotal
      )?.abs();
      const paymentAmount =
        outstandingAmount && tenderedAmount.gt(outstandingAmount)
          ? outstandingAmount
          : tenderedAmount;

      await this.paymentDoc.set('paymentMethod', paymentMethod);
      await this.paymentDoc.set('amount', paymentAmount);
      await this.paymentDoc.set('referenceType', ModelNameEnum.SalesInvoice);

      const paymentMethodDoc = (await this.paymentDoc.loadAndGetLink(
        'paymentMethod'
      )) as PaymentMethod;
      const requirements = getPaymentMethodRequirements(
        paymentMethodDoc?.type,
        paymentMethodDoc?.requiresClearanceDate
      );

      if (requirements.requiresReferenceId) {
        await this.paymentDoc.set('referenceId', this.transferRefNo);
      }

      if (requirements.requiresClearanceDate) {
        await this.paymentDoc.set('clearanceDate', this.transferClearanceDate);
      }

      if (requirements.isCash) {
        if (this.paymentDoc.paymentType === 'Pay') {
          await this.paymentDoc.setMultiple({
            account: this.defaultPOSCashAccount,
            paymentAccount: this.sinvDoc.account,
          });
        } else {
          await this.paymentDoc.setMultiple({
            account: this.sinvDoc.account,
            paymentAccount: this.defaultPOSCashAccount,
          });
        }
      }

      this.paymentDoc.once('afterSubmit', () => {
        showToast({
          type: 'success',
          message: t`Payment ${this.paymentDoc.name as string} is Saved`,
          duration: 'short',
        });
      });

      await this.paymentDoc.sync();
      await this.paymentDoc.submit();
    },
    async makeStockTransfer() {
      const shipmentDoc = (await this.sinvDoc.getStockTransfer()) as Shipment;
      if (!shipmentDoc.items) {
        return;
      }

      const inventory = await getPOSInventory(this.fyo);

      for (const item of shipmentDoc.items) {
        const trackItem = await fyo.getValue(
          ModelNameEnum.Item,
          item.item as string,
          'trackItem'
        );

        if (!trackItem) {
          continue;
        }

        item.location = inventory;

        item.serialNumber =
          this.itemSerialNumbers[item.item as string] ?? undefined;
      }

      shipmentDoc.once('afterSubmit', () => {
        showToast({
          type: 'success',
          message: t`Shipment ${shipmentDoc.name as string} is Submitted`,
          duration: 'short',
        });
      });

      await shipmentDoc.sync();
      await shipmentDoc.submit();
    },
    async submitSinvDoc() {
      this.sinvDoc.once('afterSubmit', () => {
        showToast({
          type: 'success',
          message: t`Sales Invoice ${this.sinvDoc.name as string} is Submitted`,
          duration: 'short',
        });
      });

      await this.validate();
      await this.sinvDoc.runFormulas();
      await this.sinvDoc.sync();
      await this.sinvDoc.submit();
    },
    async afterSync() {
      await this.clearValues();
      this.setSinvDoc();
    },
    async afterTransaction() {
      await this.setItemQtyMap();
      if (this.sinvDoc.isSubmitted) {
        await this.clearValues();
        this.setSinvDoc();
      }
    },
    async clearValues() {
      this.setSinvDoc();
      this.itemSerialNumbers = {};

      this.paidAmount = fyo.pesa(0);
      this.transferAmount = fyo.pesa(0);
      this.paymentMethod = undefined;
      this.transferRefNo = undefined;
      this.transferClearanceDate = undefined;
      await this.setItems();

      if (!this.defaultCustomer) {
        this.sinvDoc.party = '';
      }
    },
    async setIsPosShiftOpen() {
      this.isPosShiftOpen = !!(await fyo.db.getOpenPOSShift());
    },
    toggleModal(modal: ModalName | 'ShiftOpen', value?: boolean) {
      if (modal === 'ShiftOpen' || modal === 'ShiftClose') {
        void this.setIsPosShiftOpen();
      }
      if (modal === 'ShiftOpen') {
        return;
      }

      if (value !== undefined) {
        return (this[`open${modal}Modal`] = value);
      }

      return (this[`open${modal}Modal`] = !this[`open${modal}Modal`]);
    },
    closeAllModals() {
      for (const modal of modalNames) {
        this[`open${modal}Modal`] = false;
      }
    },
    updateValues() {
      this.setTotalQuantity();
      this.setItemDiscounts();
      this.setTotalTaxedAmount();
    },
    async validate() {
      await validatePOSCheckout(
        this.sinvDoc as SalesInvoice,
        async () => {
          await this.setItemQtyMap();
          await this.setItems();
          return this.itemQtyMap;
        },
        this.itemSerialNumbers
      );
    },
    async previewInvoice() {
      try {
        await this.sinvDoc.preview();
      } catch (error) {
        showToast({ type: 'error', message: t`${error as string}` });
      }
    },
    async routeToSinvList() {
      if (!this.sinvDoc.items?.length) {
        return await routeTo('/list/SalesInvoice');
      }

      this.openAlertModal = true;
    },
    async handleSaveAndContinue() {
      try {
        if (!this.sinvDoc.party) {
          return showToast({
            type: 'error',
            message: t`Please add a customer before saving`,
          });
        }
        await this.saveInvoiceAction();
        this.toggleModal('Alert', false);
        await this.routeTo('/list/SalesInvoice');
      } catch (error) {
        showToast({
          type: 'error',
          message: t`${error as string}`,
        });
      }
    },
    showValidationToast(method: string) {
      showToast({
        type: 'error',
        message: t`${
          !this.sinvDoc.items?.length
            ? 'Please add items'
            : 'Please select a customer'
        } before ${method}`,
      });
    },

    async saveInvoiceAction() {
      if (!this.sinvDoc.items?.length || !this.sinvDoc.party) {
        this.showValidationToast('saving');
        return;
      }
      await this.saveOrder();
    },
    handlePaymentAction() {
      if (!this.sinvDoc.items?.length || !this.sinvDoc.party) {
        this.showValidationToast('payment');
        return;
      }

      this.toggleModal('Payment', true);
    },
    routeTo,
  },
});
</script>

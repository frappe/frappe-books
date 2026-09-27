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
          :layout="layout"
          :expanded-row="expandedRow"
          @expand="(name?: string) => (expandedRow = name)"
          @select="selectRow"
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
import SelectedItemTable from 'src/components/POS/SelectedItemTable.vue';
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
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { SalesInvoiceItem } from 'models/baseModels/SalesInvoiceItem/SalesInvoiceItem';
import { AppliedCouponCodes } from 'models/baseModels/AppliedCouponCodes/AppliedCouponCodes';
import {
  addBatchItem,
  addPOSItem,
  fillRowSerialNumbers,
  validatePOSCheckout,
  getTotalQuantity,
  getTotalTaxedAmount,
  validateIsPosSettingsSet,
  setPOSRowQuantity,
  isTypingInField,
  getQuickQtyBuffer,
} from 'src/utils/pos';
import {
  getItemQtyMap,
  getItemVisibility,
  getMappedDoc,
} from 'models/helpers';
import {
  POSItem,
  POSLayout,
  ItemQtyMap,
  ItemSerialNumbers,
} from 'src/components/POS/types';
import { ValidationError } from 'fyo/utils/errors';
import { filterPOSItems, findScannedPOSItem } from 'src/utils/posItemSearch';
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
      paidAmount: computed(() => this.paidAmount),
      paymentMethod: computed(() => this.paymentMethod),
      transferRefNo: computed(() => this.transferRefNo),
      itemDiscounts: computed(() => this.itemDiscounts),
      appliedCoupons: computed(() => this.sinvDoc.coupons ?? []),
      totalTaxedAmount: computed(() => this.totalTaxedAmount),
      itemSerialNumbers: computed(() => this.itemSerialNumbers),
      isDiscountingEnabled: computed(() => this.isDiscountingEnabled),
      transferClearanceDate: computed(() => this.transferClearanceDate),
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
      openReturnSalesInvoiceModal: false,
      openBatchSelectionModal: false,
      isPosShiftOpen: false,

      totalQuantity: 0,
      paidAmount: fyo.pesa(0),
      itemDiscounts: fyo.pesa(0),
      totalTaxedAmount: fyo.pesa(0),

      loyaltyPoints: 0,
      loyaltyProgram: '' as string,

      appliedCouponsCount: 0,

      itemSearchTerm: '',
      selectedItemGroup: '',
      paymentMethod: undefined as string | undefined,
      transferRefNo: undefined as string | undefined,
      defaultCustomer: undefined as string | undefined,
      transferClearanceDate: undefined as Date | undefined,

      sinvDoc: {} as SalesInvoice,
      posProfile: null as POSProfile | null,
      itemQtyMap: {} as ItemQtyMap,
      coupons: {} as AppliedCouponCodes,
      itemSerialNumbers: {} as ItemSerialNumbers,
      quickQtyActive: false,
      quickQtyBuffer: '' as string,
      selectedRow: null as SalesInvoiceItem | null,
      keyboardField: '',
      selectedItemForBatch: '' as string,
      pendingBatchItem: null as { item: POSItem; quantity: number } | null,
      expandedRow: undefined as string | undefined,
    };
  },
  computed: {
    layout(): POSLayout {
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
    /** Targets `row` for quick quantity; a `field` opens it in the keypad. */
    selectRow(row: SalesInvoiceItem, field = '') {
      this.selectedRow = row;
      this.keyboardField = field;
      this.openKeyboardModal = !!field;
    },
    addQuickQtyListeners() {
      window.addEventListener('keydown', this.onQuickQtyKeyDown);
      window.addEventListener('keyup', this.onQuickQtyKeyUp);
    },
    removeQuickQtyListeners() {
      window.removeEventListener('keydown', this.onQuickQtyKeyDown);
      window.removeEventListener('keyup', this.onQuickQtyKeyUp);
    },
    hasAnyOpenModal(): boolean {
      return modalNames.some((modal) => this[`open${modal}Modal`]);
    },
    /** Holding Q and typing digits sets the selected row's quantity. */
    onQuickQtyKeyDown(e: KeyboardEvent) {
      if (isTypingInField(e) || this.hasAnyOpenModal()) {
        return;
      }

      if (e.code === 'KeyQ' && !this.quickQtyActive) {
        this.quickQtyActive = true;
        this.quickQtyBuffer = '';
        return;
      }

      const buffer = this.quickQtyActive
        ? getQuickQtyBuffer(this.quickQtyBuffer, e.code)
        : undefined;
      if (buffer !== undefined) {
        this.quickQtyBuffer = buffer;
        e.preventDefault();
      }
    },
    async onQuickQtyKeyUp(e: KeyboardEvent) {
      if (e.code !== 'KeyQ' || !this.quickQtyActive) {
        return;
      }

      this.quickQtyActive = false;
      const buffer = this.quickQtyBuffer;
      this.quickQtyBuffer = '';
      const row = this.getQuickQtyRow();
      if (!buffer || !row) {
        return;
      }

      const field = this.fyo.singles.InventorySettings?.enableUomConversions
        ? 'transferQuantity'
        : 'quantity';
      try {
        await setPOSRowQuantity(row, field, Number(buffer));
      } catch (error) {
        showToast({
          type: 'error',
          message: t`${error as string}`,
          duration: 'short',
        });
      }
    },
    /** The selected row, else the last row that is not a free item. */
    getQuickQtyRow(): SalesInvoiceItem | undefined {
      const items = (this.sinvDoc as SalesInvoice).items ?? [];
      const selected = this.selectedRow as SalesInvoiceItem | null;
      if (selected && items.includes(selected)) {
        return selected;
      }

      return items.filter((row) => !row.isFreeItem).at(-1);
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

    async handleItemSearch(searchTerm: string | null, addItem = false) {
      this.itemSearchTerm = searchTerm ?? '';
      const scanned =
        addItem &&
        findScannedPOSItem(
          this.items as POSItem[],
          this.itemSearchTerm,
          fyo.singles.POSSettings
        );
      if (scanned) {
        await this.addItem(scanned.item, scanned.quantity);
        this.itemSearchTerm = '';
      }
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
    setTotalQuantity() {
      this.totalQuantity = getTotalQuantity(
        this.sinvDoc.items as SalesInvoiceItem[]
      );
    },
    setTotalTaxedAmount() {
      this.totalTaxedAmount = getTotalTaxedAmount(this.sinvDoc as SalesInvoice);
    },
    setCouponsCount(value: number) {
      this.appliedCouponsCount = value;
    },
    async setLoyaltyPoints(value: number) {
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
    async addItem(item: POSItem | undefined, quantity = 1) {
      try {
        await this.sinvDoc.runFormulas();
        this.validateInvoice();
        if (!item) {
          return;
        }

        if (await this.isBatchItem(item)) {
          this.selectBatch(item, quantity);
          return;
        }

        const row = await addPOSItem(
          this.sinvDoc as SalesInvoice,
          item,
          quantity,
          this.itemQtyMap
        );
        await fillRowSerialNumbers(row, this.itemSerialNumbers);
        await this.previewInvoice();
        await this.sinvDoc.runFormulas();
      } catch (error) {
        showToast({ type: 'error', message: t`${error as string}` });
      }
    },
    async isBatchItem(item: POSItem): Promise<boolean> {
      return (
        item.hasBatch ||
        !!(await this.fyo.getValue(ModelNameEnum.Item, item.name, 'hasBatch'))
      );
    },
    selectBatch(item: POSItem, quantity: number) {
      this.selectedItemForBatch = item.name;
      this.pendingBatchItem = { item, quantity };
      this.toggleModal('BatchSelection', true);
    },
    async handleBatchSelected(batchName: string) {
      if (!this.pendingBatchItem) {
        return;
      }

      const { item, quantity } = this.pendingBatchItem as {
        item: POSItem;
        quantity: number;
      };
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
        showToast({ type: 'error', message: t`${error as string}` });
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

      const payment = (await getMappedDoc(
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

      await payment.set('paymentMethod', paymentMethod);
      await payment.set('amount', paymentAmount);
      await payment.set('referenceType', ModelNameEnum.SalesInvoice);

      const paymentMethodDoc = (await payment.loadAndGetLink(
        'paymentMethod'
      )) as PaymentMethod;
      const requirements = getPaymentMethodRequirements(
        paymentMethodDoc?.type,
        paymentMethodDoc?.requiresClearanceDate
      );

      if (requirements.requiresReferenceId) {
        await payment.set('referenceId', this.transferRefNo);
      }

      if (requirements.requiresClearanceDate) {
        await payment.set('clearanceDate', this.transferClearanceDate);
      }

      if (requirements.isCash) {
        if (payment.paymentType === 'Pay') {
          await payment.setMultiple({
            account: this.defaultPOSCashAccount,
            paymentAccount: this.sinvDoc.account,
          });
        } else {
          await payment.setMultiple({
            account: this.sinvDoc.account,
            paymentAccount: this.defaultPOSCashAccount,
          });
        }
      }

      payment.once('afterSubmit', () => {
        showToast({
          type: 'success',
          message: t`Payment ${payment.name as string} is Saved`,
          duration: 'short',
        });
      });

      await payment.sync();
      await payment.submit();
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

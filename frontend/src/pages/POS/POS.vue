<template>
  <div class="flex flex-col" :class="isMobile ? 'min-h-full' : 'min-h-0'">
    <PageHeader :title="isMobile ? mobileTitle : t`Point of Sale`">
      <template v-if="isMobile && isPosShiftOpen" #mobile-prefix>
        <FrappeButton
          v-if="openPaymentModal"
          variant="ghost"
          size="md"
          icon="lucide-chevron-left"
          class="rtl-rotate-180"
          :label="t`Back`"
          @click="cancelPayment"
        />
        <FrappeButton
          v-else
          variant="ghost"
          size="md"
          icon="lucide-x"
          :label="t`Exit POS`"
          @click="routeToSinvList"
        />
      </template>
      <template v-if="isPosShiftOpen && !openPaymentModal" #mobile>
        <MobilePOSMenu
          v-model:open="isMenuOpen"
          :enable-returns="enableReturns"
          :loyalty-program="loyaltyProgram"
          :applied-coupons-count="appliedCouponsCount"
          @select="openMenuAction"
        />
      </template>
      <slot>
        <FrappeButton
          @click="toggleModal('ShiftClose')"
        >
          <span>{{ t`Close POS Shift` }}</span>
        </FrappeButton>
      </slot>
    </PageHeader>
    <p
      v-if="isMobile && !openPaymentModal && shiftSubtitle"
      class="px-4 pt-3 text-md text-ink-gray-5"
    >
      {{ shiftSubtitle }}
    </p>
    <MobilePOS
      v-if="isMobile && !openPaymentModal"
      :items="filteredItems as POSItem[]"
      :search-term="itemSearchTerm"
      :total-quantity="totalQuantity"
      :disable-pay="disablePayButton"
      @search="handleItemSearch"
      @add-item="addItem"
      @set-customer="setCustomer"
      @hold="saveInvoiceAction"
      @pay="handlePaymentAction"
    />
    <component
      :is="layout === 'Classic' ? 'ClassicPOS' : 'ModernPOS'"
      v-else-if="!isMobile"
    >
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
            :loyalty-program="loyaltyProgram"
            :applied-coupons-count="appliedCouponsCount"
            @toggle-view="toggleView"
            @emit-route-to-sinv-list="routeToSinvList"
            @toggle-modal="toggleModal"
            @open-loyalty-program="openLoyaltyProgram"
            @open-coupon-code="openCouponCode"
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
      ref="payment"
      :open-modal="openPaymentModal"
      :loyalty-points="loyaltyPoints"
      :loyalty-program="loyaltyProgram"
      :applied-coupons-count="appliedCouponsCount"
      @set-loyalty="setLoyalty"
      @apply-coupon="openCouponCode"
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
import { Button as FrappeButton, dialog } from 'frappe-ui';
import { t } from 'fyo';
import { DateTime } from 'luxon';
import { Money } from 'pesa';
import { fyo } from 'src/initFyo';
import ModernPOS from './ModernPOS.vue';
import ClassicPOS from './ClassicPOS.vue';
import MobilePOS from './MobilePOS.vue';
import MobilePOSMenu from './MobilePOSMenu.vue';
import POSQuickActions from './POSQuickActions.vue';
import MultiLabelLink from 'src/components/Controls/MultiLabelLink.vue';
import POSItemPicker from 'src/components/POS/POSItemPicker.vue';
import POSOrderSummary from 'src/components/POS/POSOrderSummary.vue';
import POSInvoiceActions from 'src/components/POS/POSInvoiceActions.vue';
import SelectedItemTable from 'src/components/POS/SelectedItemTable.vue';
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
import { ModelNameEnum, PaymentMethodType } from 'models/types';
import { showDialog, showToast } from 'src/utils/interactive';
import { isMobile } from 'src/utils/viewport';
import { routeTo, toggleSidebar } from 'src/utils/ui';
import { shortcutsKey } from 'src/utils/injectionKeys';
import PageHeader from 'src/components/PageHeader.vue';
import { computed, defineComponent, inject, nextTick } from 'vue';
import { call } from 'src/web/api';
import {
  getPaymentMethodRequirements,
  PaymentMethodRequirements,
} from 'models/baseModels/PaymentMethod/requirements';
import { ModalName, modalNames } from 'src/components/POS/types';
import { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import { PaymentMethod } from 'models/baseModels/PaymentMethod/PaymentMethod';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import type { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import {
  addBatchItem,
  addPOSItem,
  getPOSItemFilters,
  refillSerialNumbers,
  POS_ITEM_FIELDS,
  getListedPOSItems,
  validatePOSCheckout,
  getTotalQuantity,
  setPOSRowQuantity,
  isTypingInField,
  getQuickQtyBuffer,
  getPOSQuantityField,
  getInvoicePayments,
} from 'src/utils/pos';
import {
  getItemVisibility,
  getOpenPOSShift,
  getPOSProfile,
  validateIsPosSettingsSet,
} from 'src/utils/posSetup';
import { POSOpeningShift } from 'models/inventory/Point of Sale/POSOpeningShift';
import { getAllDocuments, getDocuments } from 'src/frappe/api';
import { getFrappeDoc, newFrappeDoc } from 'src/frappe/documents';
import { getMappedDoc } from 'models/helpers';
import { getItemQtyMap } from 'models/inventory/posStock';
import {
  POSItem,
  POSLayout,
  ItemQtyMap,
} from 'src/components/POS/types';
import { ValidationError } from 'fyo/utils/errors';
import { filterPOSItems, findScannedPOSItem } from 'src/utils/posItemSearch';

const COMPONENT_NAME = 'POS';
const PAY_POS_INVOICE =
  'frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice.pay_pos_invoice';

/** A payment the cashier takes, by Books Sales Invoice Payment fieldnames. */
type TenderedPayment = {
  payment_method?: string;
  amount: Money;
  reference_id?: string;
  clearance_date?: Date;
};

export default defineComponent({
  name: 'POS',
  components: {
    FrappeButton,
    ModernPOS,
    PageHeader,
    ClassicPOS,
    MobilePOS,
    MobilePOSMenu,
    POSQuickActions,
    MultiLabelLink,
    POSItemPicker,
    POSOrderSummary,
    POSInvoiceActions,
    SelectedItemTable,
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
      paidAmount: computed(() => this.paidAmount),
      paymentMethod: computed(() => this.paymentMethod),
      transferRefNo: computed(() => this.transferRefNo),
      appliedCoupons: computed(() => this.sinvDoc.coupons ?? []),
      isDiscountingEnabled: computed(() => this.isDiscountingEnabled),
      transferClearanceDate: computed(() => this.transferClearanceDate),
    };
  },
  setup() {
    return {
      isMobile,
      shortcuts: inject(shortcutsKey),
    };
  },
  data() {
    return {
      tableView: true,

      items: [] as POSItem[],

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
      shiftOpenedAt: undefined as Date | undefined,
      isMenuOpen: false,

      totalQuantity: 0,
      paidAmount: fyo.pesa(0),

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
        this.posProfile?.pos_ui || fyo.singles.POSSettings?.pos_ui;
      return posUI === 'Classic' ? 'Classic' : 'Modern';
    },
    isDiscountingEnabled(): boolean {
      return !!fyo.singles.AccountingSettings?.enable_discounting;
    },
    enableReturns(): boolean {
      return !!fyo.singles.AccountingSettings?.enable_invoice_returns;
    },
    filteredItems() {
      return filterPOSItems(this.items, this.itemSearchTerm);
    },
    mobileTitle(): string {
      if (!this.openPaymentModal) {
        return t`POS`;
      }

      return this.sinvDoc.isReturn ? t`Refund` : t`Payment`;
    },
    shiftSubtitle(): string {
      if (!this.shiftOpenedAt) {
        return '';
      }

      const opened = DateTime.fromJSDate(this.shiftOpenedAt);
      const time = opened.hasSame(DateTime.now(), 'day')
        ? opened.toLocaleString(DateTime.TIME_SIMPLE)
        : fyo.format(this.shiftOpenedAt, 'Date');
      return t`Shift opened ${time}`;
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
    await this.setDefaultCustomer();
    await this.setItemQtyMap();
    await this.setItems();
  },
  async activated() {
    toggleSidebar(false);
    await this.setIsPosShiftOpen();
    await this.loadPOSProfile();
    validateIsPosSettingsSet(this.posProfile as POSProfile | null);
    await this.setDefaultCustomer();
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
    this.isMenuOpen = false;
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

      try {
        await setPOSRowQuantity(row, getPOSQuantityField(), Number(buffer));
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

      return items.filter((row) => !row.is_free_item).at(-1);
    },
    async setCustomer(value: string) {
      if (!value) {
        this.sinvDoc.party = '';
        return;
      }

      // Set as the user's choice, which previews keep instead of the POS customer.
      await this.sinvDoc.set('party', value);

      const [party] = await getDocuments('Books Party', {
        fields: ['loyalty_program', 'loyalty_points'],
        filters: [['name', '=', value]],
      });

      this.loyaltyProgram = party?.loyalty_program as string;
      this.loyaltyPoints = party?.loyalty_points as number;
    },

    async loadPOSProfile() {
      this.posProfile = (await getPOSProfile()) ?? null;
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
        if (this.fyo.singles.AccountingSettings?.enable_price_list) {
          this.toggleModal('PriceList', true);
        }
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
          this.fyo.singles.AccountingSettings?.enable_loyalty_program &&
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
          this.fyo.singles.AccountingSettings?.enable_coupon_code &&
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
      const visibility = await getItemVisibility();
      const items = await getAllDocuments('Books Item', {
        fields: POS_ITEM_FIELDS,
        filters: getPOSItemFilters(visibility, this.selectedItemGroup),
      });
      const hideUnavailable = !!(
        this.posProfile?.hide_unavailable_items ??
        this.fyo.singles.POSSettings?.hide_unavailable_items
      );

      this.items = getListedPOSItems(items, this.itemQtyMap, hideUnavailable);
    },
    async selectedReturnInvoice(invoiceName: string) {
      const invoice = await getFrappeDoc(ModelNameEnum.SalesInvoice, invoiceName);
      this.sinvDoc = (await getMappedDoc(
        invoice,
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
    /** A new sale for the POS customer, whom the server's preview picks. */
    async setDefaultCustomer() {
      this.sinvDoc = newFrappeDoc(ModelNameEnum.SalesInvoice, {
        is_pos: true,
      }) as SalesInvoice;
      await this.previewInvoice();
      this.defaultCustomer = this.sinvDoc.party ?? '';
    },
    async setItemQtyMap() {
      this.itemQtyMap = await getItemQtyMap();
    },
    /** A new POS sale; the server bills it to the POS account. */
    setSinvDoc() {
      this.sinvDoc = newFrappeDoc(ModelNameEnum.SalesInvoice, {
        party: this.sinvDoc.party ?? this.defaultCustomer,
        is_pos: true,
      }) as SalesInvoice;
    },
    setTotalQuantity() {
      this.totalQuantity = getTotalQuantity(
        (this.sinvDoc.items ?? []) as SalesInvoiceItem[]
      );
    },
    setCouponsCount(value: number) {
      this.appliedCouponsCount = value;
    },
    /** Turning redemption on asks for the points; off clears them. */
    async setLoyalty(on: boolean) {
      if (on) {
        return this.openLoyaltyProgram();
      }

      await this.setLoyaltyPoints(0);
    },
    async setLoyaltyPoints(value: number) {
      await this.sinvDoc.set('loyalty_points', value);
      await this.sinvDoc.set('redeem_loyalty_points', value > 0);
      await this.previewInvoice();
    },
    /** Opens a held sale; a submitted one goes on to its payment. */
    async selectedInvoiceName(invoice: { name: string; docstatus: number }) {
      const doc = await getFrappeDoc(ModelNameEnum.SalesInvoice, invoice.name);
      // A sale left with unsaved edits reopens as saved.
      if (doc.dirty) {
        await doc.load();
      }

      this.sinvDoc = doc as SalesInvoice;
      this.toggleModal('SavedInvoice', false);

      if (invoice.docstatus === 1) {
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

      if (this.sinvDoc.return_against) {
        throw new ValidationError(
          t`Unable to add an item to the return invoice.`
        );
      }
    },
    async addItem(item: POSItem | undefined, quantity = 1) {
      try {
        this.validateInvoice();
        if (!item) {
          return;
        }

        if (item.hasBatch) {
          this.selectBatch(item, quantity);
          return;
        }

        const row = await addPOSItem(
          this.sinvDoc as SalesInvoice,
          item,
          quantity,
          this.itemQtyMap
        );
        refillSerialNumbers(row);
        await this.previewInvoice();
      } catch (error) {
        showToast({ type: 'error', message: t`${error as string}` });
      }
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
        await addBatchItem(
          this.sinvDoc as SalesInvoice,
          item as POSItem,
          batchName,
          quantity ?? 1
        );
        await this.previewInvoice();
      } catch (error) {
        showToast({ type: 'error', message: t`${error as string}` });
      }
    },

    async createTransaction(shouldPrint = false, isPay = false) {
      try {
        if (isPay) {
          await this.validatePaymentDetails();
        }

        const payments = isPay ? [this.getTenderedPayment()] : [];
        if (this.sinvDoc.isSubmitted) {
          await this.payAtCounter(payments);
        } else {
          await this.setTenderedPayments(payments);
          await this.submitSinvDoc();
          if (payments.length) {
            // The sale is done; a failed lookup must not keep its cart open.
            getInvoicePayments(this.sinvDoc.name!)
              .then((names) => this.showPaymentToasts(names))
              .catch((error) =>
                showToast({ type: 'error', message: t`${error as string}` })
              );
          }
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
      if (paidAmount.isZero()) {
        throw new ValidationError(t`Please enter an amount greater than zero.`);
      }

      const paymentMethod = (await getFrappeDoc(
        ModelNameEnum.PaymentMethod,
        this.paymentMethod
      )) as PaymentMethod;
      const requirements = getPaymentMethodRequirements(
        paymentMethod.type as PaymentMethodType,
        !!paymentMethod.requires_clearance_date
      );
      if (!requirements.isCash) {
        this.validateTransfer(paidAmount, requirements);
      }
    },
    validateTransfer(
      paidAmount: Money,
      requirements: PaymentMethodRequirements
    ) {
      const outstandingAmount = (
        this.sinvDoc.outstanding_amount?.isZero()
          ? this.sinvDoc.grand_total
          : this.sinvDoc.outstanding_amount
      )?.abs();
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
    getTenderedPayment(): TenderedPayment {
      return {
        payment_method: this.paymentMethod,
        amount: this.fyo.pesa(this.paidAmount.float).abs(),
        reference_id: this.transferRefNo,
        clearance_date: this.transferClearanceDate,
      };
    },
    /** The server pays the invoice with these when it submits it. */
    async setTenderedPayments(payments: TenderedPayment[]) {
      await this.sinvDoc.set('payments', null);
      for (const payment of payments) {
        await this.sinvDoc.append('payments', payment);
      }
    },
    /** Pays an invoice submitted earlier; cash beyond what it owes is change. */
    async payAtCounter(payments: TenderedPayment[]) {
      if (!payments.length) {
        return;
      }

      const names = await call<string[]>(PAY_POS_INVOICE, {
        invoice: this.sinvDoc.name,
        payments: payments.map((payment) => ({
          ...payment,
          amount: payment.amount.float,
          clearance_date: payment.clearance_date
            ? DateTime.fromJSDate(payment.clearance_date).toISODate()
            : null,
        })),
      });
      this.showPaymentToasts(names);
    },
    showPaymentToasts(names: string[]) {
      for (const name of names) {
        showToast({
          type: 'success',
          message: t`Payment ${name} is Saved`,
          duration: 'short',
        });
      }
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
      const shift = await getOpenPOSShift();
      this.isPosShiftOpen = !!shift;
      this.shiftOpenedAt = shift
        ? (
            (await getFrappeDoc(
              ModelNameEnum.POSOpeningShift,
              shift
            )) as POSOpeningShift
          ).opening_date
        : undefined;
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
    },
    async validate() {
      await validatePOSCheckout(this.sinvDoc as SalesInvoice);
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

      const title = t`Leave this sale?`;
      const message = t`Save this sale to resume it later, or discard the selected items and continue to the invoice list.`;
      if (isMobile.value) {
        return await showDialog({
          title,
          detail: message,
          buttons: [
            {
              label: t`Save and Continue`,
              action: () => this.saveAndContinue(),
              isPrimary: true,
            },
            {
              label: t`Discard and Continue`,
              action: () => this.discardAndContinue(),
            },
            { label: t`Cancel`, action: () => null, isEscape: true },
          ],
        });
      }

      dialog.confirm({
        title,
        message,
        actions: [
          { label: t`Cancel` },
          {
            label: t`Discard and Continue`,
            theme: 'red',
            onClick: () => this.discardAndContinue(),
          },
          {
            label: t`Save and Continue`,
            variant: 'solid',
            onClick: () => this.saveAndContinue(),
          },
        ],
      });
    },
    /** POS stays cached when left, so the sale is cleared before leaving. */
    async discardAndContinue() {
      await this.clearValues();
      await routeTo('/list/SalesInvoice');
    },
    async saveAndContinue() {
      if (!this.sinvDoc.party) {
        throw new Error(t`Please add a customer before saving`);
      }

      await this.saveInvoiceAction();
      await routeTo('/list/SalesInvoice');
    },
    showValidationToast(method: string) {
      let message = t`Customer has no loyalty points to redeem`;
      if (!this.sinvDoc.items?.length) {
        message = t`Please add items`;
      } else if (!this.sinvDoc.party) {
        message = t`Please select a customer`;
      }

      showToast({ type: 'error', message: t`${message} before ${method}` });
    },
    openCouponCode() {
      if (!this.sinvDoc.items?.length || !this.sinvDoc.party) {
        return this.showValidationToast('applying coupon');
      }

      this.toggleModal('CouponCode', true);
    },
    openLoyaltyProgram() {
      if (
        !this.sinvDoc.items?.length ||
        !this.sinvDoc.party ||
        !this.loyaltyPoints
      ) {
        return this.showValidationToast('applying loyalty points');
      }

      this.toggleModal('LoyaltyProgram', true);
    },
    openMenuAction(modal: ModalName) {
      this.isMenuOpen = false;
      if (modal === 'LoyaltyProgram') {
        return this.openLoyaltyProgram();
      }

      if (modal === 'CouponCode') {
        return this.openCouponCode();
      }

      this.toggleModal(modal, true);
    },

    async saveInvoiceAction() {
      if (!this.sinvDoc.items?.length || !this.sinvDoc.party) {
        this.showValidationToast('saving');
        return;
      }
      await this.saveOrder();
    },
    cancelPayment() {
      (this.$refs.payment as InstanceType<typeof PaymentModal>).cancelTransaction();
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

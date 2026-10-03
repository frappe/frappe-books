<template>
  <div class="flex flex-col" :class="isMobile ? 'min-h-full' : 'min-h-0'">
    <PageHeader :title="isMobile ? mobileTitle : t`Point of Sale`">
      <template v-if="isMobile && shift.isOpen" #mobile-prefix>
        <!-- PageHeaderBackButton's look; its click can't wait for the leave prompt. -->
        <FrappeButton
          variant="ghost"
          size="md"
          icon="lucide-chevron-left"
          class="rtl-rotate-180"
          :label="openPaymentModal ? t`Back` : t`Exit POS`"
          @click="openPaymentModal ? cancelPayment() : routeToSinvList()"
        />
      </template>
      <template v-if="shift.isOpen && !openPaymentModal" #mobile>
        <MobilePOSMenu
          v-model:open="isMenuOpen"
          :enable-returns="enableReturns"
          :applied-coupons-count="appliedCouponsCount"
          @select="openMenuAction"
        />
      </template>
      <template v-if="shiftSubtitle" #left>
        <FrappeBadge theme="green" :label="shiftSubtitle" />
      </template>
      <POSHeaderActions
        :profile="posProfile as POSProfile"
        :enable-returns="enableReturns"
        @held="toggleModal('SavedInvoice', true)"
        @return="toggleModal('ReturnSalesInvoice', true)"
        @invoices="routeToSinvList"
        @enquiry="toggleModal('ItemEnquiry', true)"
        @close-shift="toggleModal('ShiftClose')"
      />
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
    <div v-else-if="!isMobile" class="flex min-h-0 flex-1">
      <main class="flex min-w-0 flex-1 flex-col">
        <POSItemPicker
          :items="filteredItems as POSItem[]"
          :search-items="items as POSItem[]"
          :search-term="itemSearchTerm"
          :item-group="selectedItemGroup"
          :table-view="tableView"
          @search="handleItemSearch"
          @set-item-group="setItemGroup"
          @add-item="addItem"
          @toggle-view="toggleView"
        />
      </main>

      <aside
        class="flex w-[24.5rem] shrink-0 flex-col border-s border-outline-gray-1"
        :aria-label="t`Cart`"
      >
        <div class="flex flex-col gap-2 border-b border-outline-gray-1 px-4 pb-3 pt-4">
          <div class="flex h-6 items-center justify-between gap-2">
            <span class="truncate text-sm text-ink-gray-5">{{ cartLabel }}</span>
            <POSActionButton
              v-if="sinvDoc.items?.length"
              action="cancel"
              :profile="posProfile as POSProfile"
              size="xs"
              variant="ghost"
              icon-left="lucide-trash-2"
              @click="clearValues"
            >
              {{ t`Clear cart` }}
            </POSActionButton>
          </div>
          <MultiLabelLink
            v-if="sinvDoc.fieldMap"
            class="w-full"
            secondary-link="phone"
            :border="true"
            :value="sinvDoc.party"
            :df="sinvDoc.fieldMap.party"
            :show-clear-button="true"
            :read-only="sinvDoc.isSubmitted"
            @change="setCustomer"
          />
        </div>

        <SelectedItemTable
          :layout="layout"
          :expanded-row="expandedRow"
          @expand="(name?: string) => (expandedRow = name)"
          @select="selectRow"
        />

        <div
          class="flex shrink-0 flex-col gap-3 border-t border-outline-gray-1 bg-surface-gray-1 px-4 pb-4 pt-3"
        >
          <POSPriceActions
            :applied-coupons-count="appliedCouponsCount"
            @open-coupon-code="openCouponCode"
            @open-loyalty-program="openLoyaltyProgram"
            @open-price-list="toggleModal('PriceList', true)"
          />
          <POSOrderSummary
            :sinv-doc="sinvDoc as SalesInvoice"
            :total-quantity="totalQuantity"
          />
          <POSInvoiceActions
            :profile="posProfile as POSProfile"
            :disable-pay="disablePayButton"
            :is-return="!!sinvDoc.isReturn"
            :is-submitted="sinvDoc.isSubmitted"
            :grand-total="(sinvDoc as SalesInvoice).grand_total"
            @save="saveInvoiceAction"
            @pay="handlePaymentAction"
          />
        </div>
      </aside>
    </div>

    <OpenPOSShiftModal
      v-if="shift.isLoaded && !shift.isOpen"
      :shift="shift"
      @opened="shift.refresh()"
    />
    <ClosePOSShiftModal
      :open-modal="openShiftCloseModal"
      :shift="shift"
      @toggle-modal="toggleModal('ShiftClose', false)"
      @closed="closeShift"
    />
    <LoyaltyProgramModal
      :open-modal="openLoyaltyProgramModal"
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
      :applied-coupons-count="appliedCouponsCount"
      @set-loyalty="setLoyalty"
      @apply-coupon="openCouponCode"
      @toggle-modal="toggleModal('Payment', false)"
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
import { Badge as FrappeBadge, Button as FrappeButton, dialog } from 'frappe-ui';
import { t } from 'fyo';
import { DateTime } from 'luxon';
import { fyo } from 'src/initFyo';
import MobilePOS from './MobilePOS.vue';
import MobilePOSMenu from './MobilePOSMenu.vue';
import MultiLabelLink from 'src/components/Controls/MultiLabelLink.vue';
import POSItemPicker from 'src/components/POS/POSItemPicker.vue';
import POSOrderSummary from 'src/components/POS/POSOrderSummary.vue';
import POSInvoiceActions from 'src/components/POS/POSInvoiceActions.vue';
import POSActionButton from 'src/components/POS/POSActionButton.vue';
import POSHeaderActions from 'src/components/POS/POSHeaderActions.vue';
import POSPriceActions from 'src/components/POS/POSPriceActions.vue';
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
import { ModelNameEnum } from 'models/types';
import { showDialog, showToast } from 'src/utils/interactive';
import { isMobile } from 'src/utils/viewport';
import { routeTo, toggleSidebar } from 'src/utils/ui';
import { shortcutsKey } from 'src/utils/injectionKeys';
import PageHeader from 'src/components/PageHeader.vue';
import { computed, defineComponent, inject, nextTick, shallowRef } from 'vue';
import {
  ModalName,
  modalNames,
  POS_ITEM_TOAST_ID,
} from 'src/components/POS/types';
import { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import type { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import {
  getPOSItemFilters,
  POS_ITEM_FIELDS,
  getListedPOSItems,
  validatePOSCheckout,
  isTypingInField,
  getQuickQtyBuffer,
} from 'src/utils/pos';
import { posCheckoutKey, usePOSCheckout } from 'src/utils/posCheckout';
import { canApplyCoupon, canRedeemLoyalty } from 'src/utils/posDiscounts';
import {
  addToCart,
  getTotalQuantity,
  setCartQuantity,
} from 'src/utils/posCart';
import {
  getItemVisibility,
  getPOSProfile,
  validateIsPosSettingsSet,
} from 'src/utils/posSetup';
import { usePOSShift } from 'src/utils/posShift';
import { getAllDocuments } from 'src/frappe/api';
import { getFrappeDoc, getMappedDoc, newFrappeDoc } from 'src/frappe/documents';
import { getItemQtyMap } from 'models/inventory/posStock';
import {
  POSItem,
  POSLayout,
  ItemQtyMap,
} from 'src/components/POS/types';
import { ValidationError } from 'fyo/utils/errors';
import { filterPOSItems, getScannedItem } from 'src/utils/posItemSearch';

const COMPONENT_NAME = 'POS';

export default defineComponent({
  name: 'POS',
  components: {
    FrappeBadge,
    FrappeButton,
    PageHeader,
    MobilePOS,
    MobilePOSMenu,
    POSActionButton,
    POSHeaderActions,
    POSPriceActions,
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
      appliedCoupons: computed(() => this.sinvDoc.coupons ?? []),
      isDiscountingEnabled: computed(() => this.isDiscountingEnabled),
      [posCheckoutKey]: this.posCheckout,
    };
  },
  setup() {
    // Docs are reactive themselves; the ref follows which sale is open.
    const sinvDoc = shallowRef({} as SalesInvoice);
    return {
      isMobile,
      shortcuts: inject(shortcutsKey),
      shift: usePOSShift(),
      sinvDoc,
      posCheckout: usePOSCheckout(() => sinvDoc.value),
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
      isMenuOpen: false,


      itemSearchTerm: '',
      selectedItemGroup: '',
      defaultCustomer: undefined as string | undefined,

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
    totalQuantity(): number {
      return getTotalQuantity((this.sinvDoc.items ?? []) as SalesInvoiceItem[]);
    },
    mobileTitle(): string {
      if (!this.openPaymentModal) {
        return t`POS`;
      }

      return this.sinvDoc.isReturn ? t`Refund` : t`Payment`;
    },
    coupons(): { doc: SalesInvoice; codes: string[] } {
      const doc = this.sinvDoc as SalesInvoice;
      return { doc, codes: (doc.coupons ?? []).map((row) => row.coupons ?? '') };
    },
    appliedCouponsCount(): number {
      return this.sinvDoc.coupons?.length ?? 0;
    },
    cartLabel(): string {
      const name = this.sinvDoc.inserted ? this.sinvDoc.name : t`New sale`;
      const date = this.sinvDoc.date
        ? fyo.format(this.sinvDoc.date, 'Date')
        : '';
      return [name, date].filter(Boolean).join(' · ');
    },
    shiftSubtitle(): string {
      const openedAt = this.shift.openedAt;
      if (!openedAt) {
        return '';
      }

      const opened = DateTime.fromJSDate(openedAt);
      const time = opened.hasSame(DateTime.now(), 'day')
        ? opened.toLocaleString(DateTime.TIME_SIMPLE)
        : fyo.format(openedAt, 'Date');
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
    /** A preview takes off a coupon the cart no longer allows; say which. */
    coupons(
      current: { doc: SalesInvoice; codes: string[] },
      previous: { doc: SalesInvoice; codes: string[] }
    ) {
      if (current.doc !== previous.doc || this.openCouponCodeModal) {
        return;
      }

      const removed = previous.codes.filter((c) => !current.codes.includes(c));
      if (!removed.length) {
        return;
      }

      showToast({
        id: 'pos-coupons-removed',
        type: 'warning',
        message:
          removed.length === 1
            ? t`Coupon ${removed[0]} no longer applies, so it was removed.`
            : t`Coupons ${removed.join(', ')} no longer apply, so they were removed.`,
      });
    },
  },

  async mounted() {
    await this.shift.refresh();
    await this.loadPOSProfile();
    await this.setDefaultCustomer();
    await this.setItemQtyMap();
    await this.setItems();
  },
  async activated() {
    toggleSidebar(false);
    await this.shift.refresh();
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
        await setCartQuantity(row, Number(buffer));
      } catch (error) {
        showToast({
          id: POS_ITEM_TOAST_ID,
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
    },

    async loadPOSProfile() {
      this.posProfile = (await getPOSProfile()) ?? null;
    },

    async handleItemSearch(searchTerm: string | null, addItem = false) {
      this.itemSearchTerm = searchTerm ?? '';
      const scanned =
        addItem && (await getScannedItem(this.itemSearchTerm, this.itemQtyMap));
      if (scanned) {
        await this.addItem(scanned.item, scanned.quantity);
        this.itemSearchTerm = '';
      }
    },

    /** Closes the first open modal; false when none was open. */
    closeOpenModal(): boolean {
      const modal = modalNames.find((name) => this[`open${name}Modal`]);
      if (modal) {
        this[`open${modal}Modal`] = false;
      }

      return !!modal;
    },
    setShortcuts() {
      this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyS'], async () => {
        await this.routeToSinvList();
      });

      this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyV'], () => {
        this.toggleView();
      });

      this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyP'], () => {
        if (
          this.fyo.singles.AccountingSettings?.enable_price_list &&
          !this.sinvDoc.isSubmitted
        ) {
          this.toggleModal('PriceList', true);
        }
      });

      this.shortcuts?.pmodShift.set(COMPONENT_NAME, ['KeyH'], () => {
        this.toggleModal('SavedInvoice', true);
      });

      this.shortcuts?.pmodShift.set(COMPONENT_NAME, ['Backspace'], async () => {
        if (!this.closeOpenModal()) {
          await this.clearValues();
        }
      });

      this.shortcuts?.pmodShift.set(COMPONENT_NAME, ['KeyP'], () => {
        if (!this.disablePayButton) {
          this.toggleModal('Payment', true);
        }
      });

      this.shortcuts?.pmodShift.set(COMPONENT_NAME, ['KeyS'], async () => {
        if (
          !this.hasAnyOpenModal() &&
          !this.sinvDoc.isSubmitted &&
          this.sinvDoc.party &&
          this.sinvDoc.items?.length
        ) {
          await this.saveOrder();
        }
      });

      this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyL'], () => {
        if (canRedeemLoyalty(this.sinvDoc)) {
          this.toggleModal('LoyaltyProgram', true);
        }
      });

      this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyC'], () => {
        if (canApplyCoupon(this.sinvDoc)) {
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
    async closeShift() {
      await this.shift.refresh();
      this.toggleModal('ShiftClose', false);
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

        await addToCart(this.sinvDoc as SalesInvoice, item, quantity);
        await this.previewInvoice();
      } catch (error) {
        showToast({
          id: POS_ITEM_TOAST_ID,
          type: 'error',
          message: t`${error as string}`,
        });
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
        await addToCart(
          this.sinvDoc as SalesInvoice,
          item as POSItem,
          quantity ?? 1,
          batchName
        );
        await this.previewInvoice();
      } catch (error) {
        showToast({
          id: POS_ITEM_TOAST_ID,
          type: 'error',
          message: t`${error as string}`,
        });
      }
    },

    async createTransaction(shouldPrint = false, pay = false) {
      try {
        await this.completeSale(pay);
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
    /** Submits or pays the sale; its payments are named once the server says which. */
    async completeSale(pay: boolean) {
      const isPayingSubmitted = this.sinvDoc.isSubmitted;
      const { invoice, payments } = await this.posCheckout.checkout({ pay });
      if (!isPayingSubmitted) {
        this.showSaleToast(invoice);
      }

      // The sale is done; a failed lookup must not keep its cart open.
      payments
        .then((names) =>
          isPayingSubmitted
            ? this.showPaymentToast(names)
            : this.showSaleToast(invoice, names)
        )
        .catch((error) =>
          showToast({ type: 'error', message: t`${error as string}` })
        );
    },
    showPaymentToast(payments: string[]) {
      if (!payments.length) {
        return;
      }

      showToast({
        type: 'success',
        message: t`Payment ${payments.join(', ')} is Saved`,
        duration: 'short',
      });
    },
    /** One toast per sale: the payments, once known, replace the submit message. */
    showSaleToast(invoice: string, payments: string[] = []) {
      showToast({
        id: `pos-sale-${invoice}`,
        type: 'success',
        message: payments.length
          ? t`Sales Invoice ${invoice} submitted with Payment ${payments.join(', ')}`
          : t`Sales Invoice ${invoice} is Submitted`,
        duration: 'short',
      });
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
      this.posCheckout.reset();
      await this.setItems();

      if (!this.defaultCustomer) {
        this.sinvDoc.party = '';
      }
    },
    toggleModal(modal: ModalName, value?: boolean) {
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

      if (this.sinvDoc.isSubmitted) {
        return await this.confirmLeavingSubmitted();
      }

      const title = t`Leave this sale?`;
      const message = t`Save this sale to resume it later, or discard the selected items and continue to the invoice list.`;
      if (isMobile.value) {
        return await showDialog({
          title,
          detail: message,
          buttons: [
            {
              label: t`Save and continue`,
              action: () => this.saveAndContinue(),
              isPrimary: true,
            },
            {
              label: t`Discard and continue`,
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
          { label: t`Cancel`, variant: 'ghost' },
          {
            label: t`Discard and continue`,
            theme: 'red',
            variant: 'subtle',
            onClick: () => this.discardAndContinue(),
          },
          {
            label: t`Save and continue`,
            variant: 'solid',
            onClick: () => this.saveAndContinue(),
          },
        ],
      });
    },
    /** A submitted sale has nothing to save, so it can only be left or kept open. */
    async confirmLeavingSubmitted() {
      return await showDialog({
        title: t`Leave this sale?`,
        detail: t`This invoice is already submitted. Its payment can be taken later.`,
        buttons: [
          {
            label: t`Leave`,
            action: () => this.discardAndContinue(),
            isPrimary: true,
          },
          { label: t`Cancel`, action: () => null, isEscape: true },
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

      showToast({
        id: 'pos-validation',
        type: 'error',
        message: t`${message} before ${method}`,
      });
    },
    openCouponCode() {
      if (!canApplyCoupon(this.sinvDoc)) {
        return this.showValidationToast('applying coupon');
      }

      this.toggleModal('CouponCode', true);
    },
    openLoyaltyProgram() {
      if (!canRedeemLoyalty(this.sinvDoc)) {
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

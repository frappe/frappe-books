import { ModelMap } from 'fyo/model/types';
import type { FrappeModel } from 'src/frappe/doctypes';
import { Account } from './baseModels/Account/Account';
import { AccountingLedgerEntry } from './baseModels/AccountingLedgerEntry/AccountingLedgerEntry';
import { AccountingSettings } from './baseModels/AccountingSettings/AccountingSettings';
import { Currency } from './baseModels/Currency/Currency';
import { Address } from './baseModels/Address/Address';
import { CustomField } from './baseModels/CustomForm/CustomField';
import { CustomForm } from './baseModels/CustomForm/CustomForm';
import { Defaults } from './baseModels/Defaults/Defaults';
import { GetStarted } from './baseModels/GetStarted/GetStarted';
import { Item } from './baseModels/Item/Item';
import { JournalEntry } from './baseModels/JournalEntry/JournalEntry';
import { JournalEntryAccount } from './baseModels/JournalEntryAccount/JournalEntryAccount';
import { Misc } from './baseModels/Misc';
import { NumberSeries } from './baseModels/NumberSeries/NumberSeries';
import { LoyaltyProgram } from './baseModels/LoyaltyProgram/LoyaltyProgram';
import { LoyaltyPointEntry } from './baseModels/LoyaltyPointEntry/LoyaltyPointEntry';
import { Lead } from './baseModels/Lead/Lead';
import { AppliedCouponCodes } from './baseModels/AppliedCouponCodes/AppliedCouponCodes';
import { CouponCode } from './baseModels/CouponCode/CouponCode';
import { Payment } from './baseModels/Payment/Payment';
import { Party } from './baseModels/Party/Party';
import { PaymentMethod } from './baseModels/PaymentMethod/PaymentMethod';
import { PaymentFor } from './baseModels/PaymentFor/PaymentFor';
import { PriceList } from './baseModels/PriceList/PriceList';
import { PricingRule } from './baseModels/PricingRule/PricingRule';
import { PrintSettings } from './baseModels/PrintSettings/PrintSettings';
import { PrintTemplate } from './baseModels/PrintTemplate';
import { PurchaseInvoice } from './baseModels/PurchaseInvoice/PurchaseInvoice';
import { PurchaseInvoiceItem } from './baseModels/PurchaseInvoiceItem/PurchaseInvoiceItem';
import { SalesInvoice } from './baseModels/SalesInvoice/SalesInvoice';
import { SalesInvoiceItem } from './baseModels/SalesInvoiceItem/SalesInvoiceItem';
import { SalesQuote } from './baseModels/SalesQuote/SalesQuote';
import { SalesQuoteItem } from './baseModels/SalesQuoteItem/SalesQuoteItem';
import { SetupWizard } from './baseModels/SetupWizard/SetupWizard';
import { SystemSettings } from './baseModels/SystemSettings/SystemSettings';
import { ItemGroup } from './baseModels/ItemGroup/ItemGroup';
import { Tax } from './baseModels/Tax/Tax';
import { UOM } from './baseModels/UOM/UOM';
import { TaxSummary } from './baseModels/TaxSummary/TaxSummary';
import { Batch } from './inventory/Batch';
import { InventorySettings } from './inventory/InventorySettings';
import { Location } from './inventory/Location';
import { PurchaseReceipt } from './inventory/PurchaseReceipt';
import { PurchaseReceiptItem } from './inventory/PurchaseReceiptItem';
import { SerialNumber } from './inventory/SerialNumber';
import { Shipment } from './inventory/Shipment';
import { ShipmentItem } from './inventory/ShipmentItem';
import { StockLedgerEntry } from './inventory/StockLedgerEntry';
import { StockMovement } from './inventory/StockMovement';
import { StockMovementItem } from './inventory/StockMovementItem';
import { ClosingAmounts } from './inventory/Point of Sale/ClosingAmounts';
import { ClosingCash } from './inventory/Point of Sale/ClosingCash';
import { OpeningAmounts } from './inventory/Point of Sale/OpeningAmounts';
import { OpeningCash } from './inventory/Point of Sale/OpeningCash';
import { POSSettings } from './inventory/Point of Sale/POSSettings';
import { POSProfile } from './baseModels/POSProfile/PosProfile';
import { POSOpeningShift } from './inventory/Point of Sale/POSOpeningShift';
import { POSClosingShift } from './inventory/Point of Sale/POSClosingShift';
import { ItemEnquiry } from './baseModels/ItemEnquiry/ItemEnquiry';

export const models = {
  AccountingLedgerEntry,
  JournalEntry,
  JournalEntryAccount,
  LoyaltyPointEntry,
  Payment,
  PaymentFor,
  PrintSettings,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  SalesInvoice,
  SalesInvoiceItem,
  AppliedCouponCodes,
  SalesQuote,
  SalesQuoteItem,
  PrintTemplate,
  TaxSummary,
  // Inventory Models
  StockMovement,
  StockMovementItem,
  StockLedgerEntry,
  Shipment,
  ShipmentItem,
  PurchaseReceipt,
  PurchaseReceiptItem,
  // POS Models
  ClosingAmounts,
  ClosingCash,
  OpeningAmounts,
  OpeningCash,
  POSProfile,
  POSOpeningShift,
  POSClosingShift,
} as ModelMap;

/**
 * Models of the schemas Frappe serves directly. A schema moves here from
 * `models` when its module stops using the bridge; see docs/framework-backed-doctypes.md.
 */
export const frappeModels: Record<string, FrappeModel> = {
  Account,
  AccountingSettings,
  Address,
  Batch,
  CouponCode,
  Currency,
  CustomField,
  CustomForm,
  Defaults,
  GetStarted,
  InventorySettings,
  Item,
  ItemEnquiry,
  ItemGroup,
  Lead,
  Location,
  LoyaltyProgram,
  Misc,
  NumberSeries,
  POSSettings,
  Party,
  PaymentMethod,
  PriceList,
  PricingRule,
  SerialNumber,
  SetupWizard,
  SystemSettings,
  Tax,
  UOM,
};

/** Regional models of Frappe-backed schemas, which replace their `frappeModels` entries. */
export async function getRegionalFrappeModels(
  countryCode: string
): Promise<Record<string, FrappeModel>> {
  if (countryCode !== 'in') {
    return {};
  }

  const [{ Address }, { Party }] = await Promise.all([
    import('./regionalModels/in/Address'),
    import('./regionalModels/in/Party'),
  ]);
  return { Address, Party };
}

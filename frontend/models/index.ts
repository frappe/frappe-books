import { ModelMap } from 'fyo/model/types';
import type { FrappeModel } from 'src/frappe/doctypes';
import { Account } from './baseModels/Account/Account';
import { AccountingLedgerEntry } from './baseModels/AccountingLedgerEntry/AccountingLedgerEntry';
import { AccountingSettings } from './baseModels/AccountingSettings/AccountingSettings';
import { Currency } from './baseModels/Currency/Currency';
import { Address } from './baseModels/Address/Address';
import { CustomForm } from './baseModels/CustomForm/CustomForm';
import { Defaults } from './baseModels/Defaults/Defaults';
import { GetStarted } from './baseModels/GetStarted/GetStarted';
import { Item } from './baseModels/Item/Item';
import { JournalEntry } from './baseModels/JournalEntry/JournalEntry';
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
import { PriceList } from './baseModels/PriceList/PriceList';
import { PricingRule } from './baseModels/PricingRule/PricingRule';
import { PrintFormat } from './baseModels/PrintFormat';
import { PrintSettings } from './baseModels/PrintSettings/PrintSettings';
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
import { SerialNumber } from './inventory/SerialNumber';
import { Shipment } from './inventory/Shipment';
import { StockLedgerEntry } from './inventory/StockLedgerEntry';
import { StockMovement } from './inventory/StockMovement';
import { POSSettings } from './inventory/Point of Sale/POSSettings';
import { POSProfile } from './baseModels/POSProfile/PosProfile';
import { POSOpeningShift } from './inventory/Point of Sale/POSOpeningShift';
import { POSClosingShift } from './inventory/Point of Sale/POSClosingShift';
import { ItemEnquiry } from './baseModels/ItemEnquiry/ItemEnquiry';
import * as invoices from './invoices';

export const models = {
  PrintSettings,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  SalesInvoice,
  SalesInvoiceItem,
  AppliedCouponCodes,
  SalesQuote,
  SalesQuoteItem,
  PrintFormat,
  TaxSummary,
} as ModelMap;

/**
 * Models of the schemas Frappe serves directly. A schema moves here from
 * `models` when its module stops using the bridge; see docs/framework-backed-doctypes.md.
 */
export const frappeModels: Record<string, FrappeModel> = {
  Account,
  AccountingLedgerEntry,
  AccountingSettings,
  Address,
  Batch,
  CouponCode,
  Currency,
  CustomForm,
  Defaults,
  GetStarted,
  InventorySettings,
  Item,
  ItemEnquiry,
  ItemGroup,
  JournalEntry,
  Lead,
  Location,
  LoyaltyPointEntry,
  LoyaltyProgram,
  Misc,
  NumberSeries,
  POSClosingShift,
  POSOpeningShift,
  POSProfile,
  POSSettings,
  Party,
  Payment,
  PaymentMethod,
  PriceList,
  PricingRule,
  PurchaseReceipt,
  SerialNumber,
  SetupWizard,
  Shipment,
  StockLedgerEntry,
  StockMovement,
  SystemSettings,
  Tax,
  UOM,
  SalesInvoice: invoices.SalesInvoice,
  PurchaseInvoice: invoices.PurchaseInvoice,
  SalesQuote: invoices.SalesQuote,
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

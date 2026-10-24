import type { FrappeModel } from 'src/frappe/doctypes';
import { Account } from './baseModels/Account/Account';
import { AccountingLedgerEntry } from './baseModels/AccountingLedgerEntry/AccountingLedgerEntry';
import { AccountingSettings } from './baseModels/AccountingSettings/AccountingSettings';
import { Company } from './baseModels/Company/Company';
import { Country } from './baseModels/Country';
import { Currency } from './baseModels/Currency/Currency';
import { Address } from './baseModels/Address/Address';
import { Contact } from './baseModels/Contact/Contact';
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
import { CouponCode } from './baseModels/CouponCode/CouponCode';
import { Payment } from './baseModels/Payment/Payment';
import { Customer } from './baseModels/Customer/Customer';
import { Supplier } from './baseModels/Supplier/Supplier';
import { ModeOfPayment } from './baseModels/ModeOfPayment/ModeOfPayment';
import { ItemPrice } from './baseModels/ItemPrice/ItemPrice';
import { PriceList } from './baseModels/PriceList/PriceList';
import { PricingRule } from './baseModels/PricingRule/PricingRule';
import { PrintFormat } from './baseModels/PrintFormat';
import { PrintSettings } from './baseModels/PrintSettings/PrintSettings';
import { SetupWizard } from './baseModels/SetupWizard/SetupWizard';
import { SystemSettings } from './baseModels/SystemSettings/SystemSettings';
import { ItemGroup } from './baseModels/ItemGroup/ItemGroup';
import { ItemTaxTemplate } from './baseModels/ItemTaxTemplate/ItemTaxTemplate';
import { UOM } from './baseModels/UOM/UOM';
import { Batch } from './inventory/Batch';
import { InventorySettings } from './inventory/InventorySettings';
import { Warehouse } from './inventory/Warehouse';
import { PurchaseReceipt } from './inventory/PurchaseReceipt';
import { SerialNo } from './inventory/SerialNo';
import { DeliveryNote } from './inventory/DeliveryNote';
import { StockLedgerEntry } from './inventory/StockLedgerEntry';
import { StockEntry } from './inventory/StockEntry';
import { POSSettings } from './inventory/Point of Sale/POSSettings';
import { POSProfile } from './baseModels/POSProfile/PosProfile';
import { POSOpeningShift } from './inventory/Point of Sale/POSOpeningShift';
import { POSClosingShift } from './inventory/Point of Sale/POSClosingShift';
import { ItemEnquiry } from './baseModels/ItemEnquiry/ItemEnquiry';
import * as invoices from './invoices';

/**
 * The model of each schema, by schema name; see docs/framework-backed-doctypes.md.
 * The search palette lists the schemas in this order.
 */
export const frappeModels: Record<string, FrappeModel> = {
  Misc,
  SetupWizard,
  GetStarted,
  PrintFormat,
  Country,
  Currency,
  Defaults,
  NumberSeries,
  PrintSettings,
  Account,
  AccountingSettings,
  Company,
  AccountingLedgerEntry,
  Customer,
  Supplier,
  Lead,
  Contact,
  Address,
  ItemGroup,
  Item,
  UOM,
  LoyaltyProgram,
  LoyaltyPointEntry,
  Payment,
  ModeOfPayment,
  JournalEntry,
  ItemEnquiry,
  CouponCode,
  PriceList,
  ItemPrice,
  PricingRule,
  ItemTaxTemplate,
  InventorySettings,
  Warehouse,
  StockLedgerEntry,
  StockEntry,
  Batch,
  SerialNo,
  CustomForm,
  POSSettings,
  POSProfile,
  POSOpeningShift,
  POSClosingShift,
  SalesInvoice: invoices.SalesInvoice,
  PurchaseInvoice: invoices.PurchaseInvoice,
  Quotation: invoices.Quotation,
  DeliveryNote,
  PurchaseReceipt,
  SystemSettings,
};

/** Regional models of Frappe-backed schemas, which replace their `frappeModels` entries. */
export async function getRegionalFrappeModels(
  countryCode: string
): Promise<Record<string, FrappeModel>> {
  if (countryCode !== 'in') {
    return {};
  }

  const [{ Account }, { Customer, Supplier }] = await Promise.all([
    import('./regionalModels/in/Account'),
    import('./regionalModels/in/Party'),
  ]);
  return { Account, Customer, Supplier };
}

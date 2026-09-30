import Account from './app/Account.json';
import AccountingLedgerEntry from './app/AccountingLedgerEntry.json';
import AccountingSettings from './app/AccountingSettings.json';
import Address from './app/Address.json';
import Batch from './app/Batch.json';
import Country from './app/Country.json';
import Currency from './app/Currency.json';
import Defaults from './app/Defaults.json';
import GetStarted from './app/GetStarted.json';
import Invoice from './app/Invoice.json';
import InvoiceItem from './app/InvoiceItem.json';
import Item from './app/Item.json';
import JournalEntry from './app/JournalEntry.json';
import JournalEntryAccount from './app/JournalEntryAccount.json';
import Misc from './app/Misc.json';
import NumberSeries from './app/NumberSeries.json';
import Party from './app/Party.json';
import Lead from './app/Lead.json';
import LoyaltyProgram from './app/LoyaltyProgram.json';
import LoyaltyPointEntry from './app/LoyaltyPointEntry.json';
import CollectionRulesItems from './app/CollectionRulesItems.json';
import CouponCode from './app/CouponCode.json';
import AppliedCouponCodes from './app/AppliedCouponCodes.json';
import Payment from './app/Payment.json';
import PaymentMethod from './app/PaymentMethod.json';
import PaymentFor from './app/PaymentFor.json';
import PriceList from './app/PriceList.json';
import PriceListItem from './app/PriceListItem.json';
import PricingRule from './app/PricingRule.json';
import PricingRuleItem from './app/PricingRuleItem.json';
import PricingRuleDetail from './app/PricingRuleDetail.json';
import PrintFormat from './app/PrintFormat.json';
import PrintSettings from './app/PrintSettings.json';
import PrintTemplate from './app/PrintTemplate.json';
import PurchaseInvoice from './app/PurchaseInvoice.json';
import PurchaseInvoiceItem from './app/PurchaseInvoiceItem.json';
import SalesInvoice from './app/SalesInvoice.json';
import SalesInvoiceItem from './app/SalesInvoiceItem.json';
import SalesInvoicePayment from './app/SalesInvoicePayment.json';
import SalesQuote from './app/SalesQuote.json';
import SalesQuoteItem from './app/SalesQuoteItem.json';
import SetupWizard from './app/SetupWizard.json';
import Tax from './app/Tax.json';
import TaxDetail from './app/TaxDetail.json';
import TaxSummary from './app/TaxSummary.json';
import UOM from './app/UOM.json';
import InventorySettings from './app/inventory/InventorySettings.json';
import Location from './app/inventory/Location.json';
import PurchaseReceipt from './app/inventory/PurchaseReceipt.json';
import PurchaseReceiptItem from './app/inventory/PurchaseReceiptItem.json';
import SerialNumber from './app/inventory/SerialNumber.json';
import Shipment from './app/inventory/Shipment.json';
import ShipmentItem from './app/inventory/ShipmentItem.json';
import StockLedgerEntry from './app/inventory/StockLedgerEntry.json';
import StockMovement from './app/inventory/StockMovement.json';
import StockMovementItem from './app/inventory/StockMovementItem.json';
import StockTransfer from './app/inventory/StockTransfer.json';
import StockTransferItem from './app/inventory/StockTransferItem.json';
import UOMConversionItem from './app/inventory/UOMConversionItem.json';
import CustomField from './core/CustomField.json';
import CustomForm from './core/CustomForm.json';
import SingleValue from './core/SingleValue.json';
import SystemSettings from './core/SystemSettings.json';
import base from './meta/base.json';
import child from './meta/child.json';
import submittable from './meta/submittable.json';
import tree from './meta/tree.json';
import CashDenominations from './app/inventory/Point of Sale/CashDenominations.json';
import ClosingAmounts from './app/inventory/Point of Sale/ClosingAmounts.json';
import ClosingCash from './app/inventory/Point of Sale/ClosingCash.json';
import DefaultCashDenominations from './app/inventory/Point of Sale/DefaultCashDenominations.json';
import OpeningAmounts from './app/inventory/Point of Sale/OpeningAmounts.json';
import OpeningCash from './app/inventory/Point of Sale/OpeningCash.json';
import POSSettings from './app/inventory/Point of Sale/POSSettings.json';
import POSProfile from './app/POSProfile.json';
import POSOpeningShift from './app/inventory/Point of Sale/POSOpeningShift.json';
import POSClosingShift from './app/inventory/Point of Sale/POSClosingShift.json';
import POSShiftAmounts from './app/inventory/Point of Sale/POSShiftAmounts.json';
import ItemGroup from './app/ItemGroup.json';
import { SchemaFile, SchemaStub } from './types';
import ItemEnquiry from './app/ItemEnquiry.json';

export const coreSchemas: SchemaFile[] = [
  SingleValue as SchemaFile,
  SystemSettings as SchemaFile,
];

export const metaSchemas: SchemaStub[] = [
  base as SchemaStub,
  child as SchemaStub,
  submittable as SchemaStub,
  tree as SchemaStub,
];

export const appSchemas: SchemaFile[] = [
  Misc as SchemaFile,
  SetupWizard as SchemaFile,
  GetStarted as SchemaFile,
  PrintTemplate as SchemaFile,
  PrintFormat as SchemaFile,

  Country as SchemaFile,
  Currency as SchemaFile,
  Defaults as SchemaFile,
  NumberSeries as SchemaFile,

  PrintSettings as SchemaFile,

  Account as SchemaFile,
  AccountingSettings as SchemaFile,
  AccountingLedgerEntry as SchemaFile,

  Party as SchemaFile,
  Lead as SchemaFile,
  Address as SchemaFile,
  ItemGroup as SchemaFile,
  Item as SchemaFile,
  UOM as SchemaFile,
  UOMConversionItem as SchemaFile,

  LoyaltyProgram as SchemaFile,
  LoyaltyPointEntry as SchemaFile,
  CollectionRulesItems as SchemaFile,

  Payment as SchemaFile,
  PaymentMethod as SchemaFile,
  PaymentFor as SchemaFile,

  JournalEntry as SchemaFile,
  JournalEntryAccount as SchemaFile,

  Invoice as SchemaFile,
  ItemEnquiry as SchemaFile,
  SalesInvoice as SchemaFile,
  PurchaseInvoice as SchemaFile,
  SalesQuote as SchemaFile,

  InvoiceItem as SchemaFile,
  SalesInvoiceItem as SchemaFile,
  SalesInvoicePayment as SchemaFile,
  PurchaseInvoiceItem as SchemaFile,
  SalesQuoteItem as SchemaFile,
  CouponCode as SchemaFile,
  AppliedCouponCodes as SchemaFile,

  PriceList as SchemaFile,
  PriceListItem as SchemaFile,

  PricingRule as SchemaFile,
  PricingRuleItem as SchemaFile,
  PricingRuleDetail as SchemaFile,

  Tax as SchemaFile,
  TaxDetail as SchemaFile,
  TaxSummary as SchemaFile,

  InventorySettings as SchemaFile,
  Location as SchemaFile,
  StockLedgerEntry as SchemaFile,
  StockMovement as SchemaFile,
  StockMovementItem as SchemaFile,

  StockTransfer as SchemaFile,
  StockTransferItem as SchemaFile,
  Shipment as SchemaFile,
  ShipmentItem as SchemaFile,
  PurchaseReceipt as SchemaFile,
  PurchaseReceiptItem as SchemaFile,

  Batch as SchemaFile,
  SerialNumber as SchemaFile,

  CustomForm as SchemaFile,
  CustomField as SchemaFile,

  CashDenominations as SchemaFile,
  ClosingAmounts as SchemaFile,
  ClosingCash as SchemaFile,
  DefaultCashDenominations as SchemaFile,
  OpeningAmounts as SchemaFile,
  OpeningCash as SchemaFile,
  POSSettings as SchemaFile,
  POSProfile as SchemaFile,
  POSOpeningShift as SchemaFile,
  POSClosingShift as SchemaFile,
  POSShiftAmounts as SchemaFile,

];

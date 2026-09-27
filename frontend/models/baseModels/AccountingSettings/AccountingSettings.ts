import { Doc } from 'fyo/model/doc';
import {
  FiltersMap,
  HiddenMap,
  ListsMap,
  ReadOnlyMap,
  ValidationMap,
} from 'fyo/model/types';
import { validateEmail } from 'fyo/model/validationFunction';
import { getCountryInfo } from 'utils/misc';

export class AccountingSettings extends Doc {
  enableDiscounting?: boolean;
  enableInventory?: boolean;
  enablePriceList?: boolean;
  enableLead?: boolean;
  enableCouponCode?: boolean;
  enableFormCustomization?: boolean;
  enableInvoiceReturns?: boolean;
  enableLoyaltyProgram?: boolean;
  enablePricingRule?: boolean;
  enaenableItemEnquiry?: boolean;
  enablePointOfSaleWithOutInventory?: boolean;
  enablePartialPayment?: boolean;
  enableitemGroup?: boolean;

  static filters: FiltersMap = {
    writeOffAccount: () => ({
      isGroup: false,
      rootType: 'Expense',
    }),
    roundOffAccount: () => ({
      isGroup: false,
      rootType: 'Expense',
    }),
    discountAccount: () => ({
      isGroup: false,
      rootType: 'Income',
    }),
  };

  validations: ValidationMap = {
    email: validateEmail,
  };

  static lists: ListsMap = {
    country: () => Object.keys(getCountryInfo()),
  };

  readOnly: ReadOnlyMap = {
    enableDiscounting: () => {
      return !!this.enableDiscounting;
    },
    enableInventory: () => {
      return !!this.enableInventory;
    },
    enableLead: () => {
      return !!this.enableLead;
    },
    enableInvoiceReturns: () => {
      return !!this.enableInvoiceReturns;
    },
    enableLoyaltyProgram: () => {
      return !!this.enableLoyaltyProgram;
    },
    enablePointOfSaleWithOutInventory: () => {
      return !!this.enablePointOfSaleWithOutInventory;
    },
    enableitemGroup: () => {
      return !!this.enableitemGroup;
    },
  };

  override hidden: HiddenMap = {
    discountAccount: () => !this.enableDiscounting,
    gstin: () => this.fyo.singles.SystemSettings?.countryCode !== 'in',
    enablePricingRule: () =>
      !this.fyo.singles.AccountingSettings?.enableDiscounting,
    enableCouponCode: () =>
      !this.fyo.singles.AccountingSettings?.enablePricingRule,
  };
}

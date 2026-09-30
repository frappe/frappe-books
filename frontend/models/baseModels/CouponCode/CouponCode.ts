import { Doc } from 'fyo/model/doc';
import { FiltersMap, FormulaMap, ListViewSettings } from 'fyo/model/types';
import { Money } from 'pesa';

export class CouponCode extends Doc {
  name?: string;
  couponName?: string;
  pricingRule?: string;

  validFrom?: Date;
  validTo?: Date;

  minAmount?: Money;
  maxAmount?: Money;

  formulas: FormulaMap = {
    name: {
      formula: () => {
        return this.couponName?.replace(/\s+/g, '').toUpperCase().slice(0, 8);
      },
      dependsOn: ['couponName'],
    },
  };

  static filters: FiltersMap = {
    // Pricing rules are Frappe-backed, so their filters use Frappe fieldnames.
    pricingRule: () => ({
      is_coupon_code_based: true,
    }),
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'couponName', 'pricingRule', 'maximumUse', 'used'],
    };
  }
}

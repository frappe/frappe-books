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
    pricingRule: () => ({
      isCouponCodeBased: true,
    }),
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'couponName', 'pricingRule', 'maximumUse', 'used'],
    };
  }
}

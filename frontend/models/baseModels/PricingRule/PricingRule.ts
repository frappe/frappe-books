import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { HiddenMap, ListViewSettings, ValidationMap } from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { getIsDocEnabledColumn } from 'models/helpers';
import { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import { PricingRuleItem } from '../PricingRuleItem/PricingRuleItem';

/**
 * Books Pricing Rule, served by Frappe. The DocType shows each discount
 * scheme's fields; its preview fills each applied item's unit.
 */
export class PricingRule extends FrappeDoc {
  static override doctype = 'Books Pricing Rule';
  static override presentation = {
    label: 'Pricing Rule',
    nameField: { label: 'ID' },
    fields: {
      applied_items: { edit: true },
      price_discount_type: {
        optionLabels: {
          rate: 'Rate',
          percentage: 'Discount Percentage',
          amount: 'Discount Amount',
        },
      },
      rounding_method: {
        optionLabels: { floor: 'Floor', round: 'Round', ceil: 'Ceil' },
      },
      ...withoutCreate(['free_item', 'free_item_unit']),
    },
  };
  static override previewMethod = 'preview';
  static override rowModels = { applied_items: PricingRuleItem };

  min_quantity?: number;
  max_quantity?: number;
  min_amount?: Money;
  max_amount?: Money;
  valid_from?: Date;
  valid_to?: Date;

  // The server checks these too; mirrored to show its message at the field.
  validations: ValidationMap = {
    min_quantity: (value: DocValue) =>
      validateQuantities(value as number, this.max_quantity),
    max_quantity: (value: DocValue) =>
      validateQuantities(this.min_quantity, value as number),
    min_amount: (value: DocValue) =>
      validateAmounts(value as Money, this.max_amount),
    max_amount: (value: DocValue) =>
      validateAmounts(this.min_amount, value as Money),
    valid_from: (value: DocValue) =>
      validateDates(value as Date, this.valid_to),
    valid_to: (value: DocValue) =>
      validateDates(this.valid_from, value as Date),
  };

  hidden: HiddenMap = {
    is_coupon_code_based: () =>
      !this.fyo.singles.AccountingSettings?.enable_coupon_code,
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'title', getIsDocEnabledColumn(), 'discount_type'],
    };
  }
}

function validateQuantities(minimum?: number, maximum?: number) {
  if (minimum && maximum && minimum > maximum) {
    throw new ValidationError(
      t`Minimum quantity must be less than maximum quantity.`
    );
  }
}

function validateAmounts(minimum?: Money, maximum?: Money) {
  if (!minimum || !maximum || minimum.isZero() || maximum.isZero()) {
    return;
  }

  if (minimum.gte(maximum)) {
    throw new ValidationError(
      t`Minimum amount must be less than maximum amount.`
    );
  }
}

function validateDates(validFrom?: Date, validTo?: Date) {
  if (validFrom && validTo && validFrom > validTo) {
    throw new ValidationError(t`Valid From must be on or before Valid To.`);
  }
}

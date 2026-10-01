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

  // The server checks these too, with the message of the edited field.
  validations: ValidationMap = {
    min_quantity: (value: DocValue) =>
      validateQuantities(
        value as number,
        this.max_quantity,
        t`Minimum Quantity should be less than the Maximum Quantity.`
      ),
    max_quantity: (value: DocValue) =>
      validateQuantities(
        this.min_quantity,
        value as number,
        t`Maximum Quantity should be greater than the Minimum Quantity.`
      ),
    min_amount: (value: DocValue) =>
      validateAmounts(
        value as Money,
        this.max_amount,
        t`Minimum Amount should be less than the Maximum Amount.`
      ),
    max_amount: (value: DocValue) =>
      validateAmounts(
        this.min_amount,
        value as Money,
        t`Maximum Amount should be greater than the Minimum Amount.`
      ),
    valid_from: (value: DocValue) =>
      validateDates(
        value as Date,
        this.valid_to,
        t`Valid From Date should be less than Valid To Date.`
      ),
    valid_to: (value: DocValue) =>
      validateDates(
        this.valid_from,
        value as Date,
        t`Valid To Date should be greater than Valid From Date.`
      ),
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

function validateQuantities(
  minimum: number | undefined,
  maximum: number | undefined,
  message: string
) {
  if (minimum && maximum && minimum > maximum) {
    throw new ValidationError(message);
  }
}

function validateAmounts(
  minimum: Money | undefined,
  maximum: Money | undefined,
  message: string
) {
  if (!minimum || !maximum || minimum.isZero() || maximum.isZero()) {
    return;
  }

  if (minimum.gte(maximum)) {
    throw new ValidationError(message);
  }
}

function validateDates(
  validFrom: Date | undefined,
  validTo: Date | undefined,
  message: string
) {
  if (validFrom && validTo && validFrom > validTo) {
    throw new ValidationError(message);
  }
}

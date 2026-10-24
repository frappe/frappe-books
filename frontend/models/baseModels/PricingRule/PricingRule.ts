import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { HiddenMap, ListViewSettings, ValidationMap } from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { getIsDocEnabledColumn } from 'models/helpers';
import { Money } from 'pesa';
import { FrappeDoc } from 'src/frappe/document';
import { withoutCreate } from 'src/frappe/schema';
import { PricingRuleItemCode } from '../PricingRuleItemCode/PricingRuleItemCode';

/**
 * Books Pricing Rule, served by Frappe. The DocType shows each discount
 * scheme's fields; its preview fills each item's UOM.
 */
export class PricingRule extends FrappeDoc {
  static override doctype = 'Books Pricing Rule';
  static override presentation = {
    label: 'Pricing Rule',
    nameField: { label: 'ID' },
    fields: {
      items: { edit: true },
      rounding_method: {
        optionLabels: { floor: 'Floor', round: 'Round', ceil: 'Ceil' },
      },
      ...withoutCreate(['free_item', 'free_item_uom']),
    },
  };
  static override previewMethod = 'preview';
  static override rowModels = { items: PricingRuleItemCode };

  min_qty?: number;
  max_qty?: number;
  min_amt?: Money;
  max_amt?: Money;
  valid_from?: Date;
  valid_upto?: Date;

  // The server checks these too, with the message of the edited field.
  validations: ValidationMap = {
    min_qty: (value: DocValue) =>
      validateQuantities(
        value as number,
        this.max_qty,
        t`Minimum Quantity should be less than the Maximum Quantity.`
      ),
    max_qty: (value: DocValue) =>
      validateQuantities(
        this.min_qty,
        value as number,
        t`Maximum Quantity should be greater than the Minimum Quantity.`
      ),
    min_amt: (value: DocValue) =>
      validateAmounts(
        value as Money,
        this.max_amt,
        t`Minimum Amount should be less than the Maximum Amount.`
      ),
    max_amt: (value: DocValue) =>
      validateAmounts(
        this.min_amt,
        value as Money,
        t`Maximum Amount should be greater than the Minimum Amount.`
      ),
    valid_from: (value: DocValue) =>
      validateDates(
        value as Date,
        this.valid_upto,
        t`Valid From Date should be less than Valid To Date.`
      ),
    valid_upto: (value: DocValue) =>
      validateDates(
        this.valid_from,
        value as Date,
        t`Valid To Date should be greater than Valid From Date.`
      ),
  };

  hidden: HiddenMap = {
    coupon_code_based: () => !this.fyo.isFeatureOn('enable_coupon_code'),
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        'title',
        getIsDocEnabledColumn('disable'),
        'price_or_product_discount',
      ],
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

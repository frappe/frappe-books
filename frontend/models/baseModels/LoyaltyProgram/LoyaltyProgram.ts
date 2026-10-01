import { DocValue } from 'fyo/core/types';
import { ListViewSettings, ValidationMap } from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { t } from 'fyo';
import { getLoyaltyProgramStatusColumn } from 'models/helpers';
import { FrappeDoc } from 'src/frappe/document';
import { CollectionRulesItems } from './CollectionRulesItems';

/** Books Loyalty Program, served by Frappe. The server keeps its status. */
export class LoyaltyProgram extends FrappeDoc {
  static override doctype = 'Books Loyalty Program';
  static override presentation = {
    label: 'Loyalty Program',
    nameField: { label: 'Name', placeholder: 'Name' },
    quickEditFields: [
      'name',
      'from_date',
      'to_date',
      'conversion_factor',
      'expense_account',
      'maximum_use',
      'used',
    ],
    fields: { expense_account: { create: false } },
  };
  static override rowModels = { collection_rules: CollectionRulesItems };

  maximum_use?: number;
  status?: 'Active' | 'Expired' | 'Disabled' | 'Maxed';

  // The server checks these too; mirrored to show its message at the field.
  validations: ValidationMap = {
    used: (value: DocValue) => {
      const maximumUse = this.maximum_use ?? 0;
      if ((value as number) < 0) {
        throw new ValidationError(t`Used count cannot be negative`);
      }

      if (maximumUse > 0 && (value as number) > maximumUse) {
        throw new ValidationError(
          t`Used count cannot exceed maximum use limit`
        );
      }
    },
    maximum_use: (value: DocValue) => {
      if ((value as number) < 0) {
        throw new ValidationError(t`Maximum use cannot be negative`);
      }
    },
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getLoyaltyProgramStatusColumn(),
        'from_date',
        'to_date',
      ],
    };
  }
}

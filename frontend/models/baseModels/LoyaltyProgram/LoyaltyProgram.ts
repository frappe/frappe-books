import { DocValue } from 'fyo/core/types';
import { ListViewSettings, ValidationMap } from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { t } from 'fyo';
import { getLoyaltyProgramStatusColumn } from 'models/helpers';
import { FrappeDoc } from 'src/frappe/document';

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
  };

  maximum_use?: number;
  status?: 'Active' | 'Expired' | 'Disabled' | 'Maxed';

  // The server checks these too; mirrored to show its message at the field.
  validations: ValidationMap = {
    used: (value: DocValue) => {
      validateUsage(value as number);
      const maximumUse = this.maximum_use ?? 0;
      if (maximumUse > 0 && (value as number) > maximumUse) {
        throw new ValidationError(
          t`Loyalty-program usage cannot exceed its maximum.`
        );
      }
    },
    maximum_use: (value: DocValue) => validateUsage(value as number),
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

function validateUsage(count: number) {
  if (count < 0) {
    throw new ValidationError(
      t`Loyalty-program usage counts cannot be negative.`
    );
  }
}

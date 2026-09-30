import { ListsMap, ValidationMap } from 'fyo/model/types';
import { validateEmail } from 'fyo/model/validationFunction';
import { FrappeDoc } from 'src/frappe/document';

/**
 * Books Setup Wizard, served by Frappe. Its preview suggests the currency,
 * chart of accounts and fiscal year of the chosen country.
 */
export class SetupWizard extends FrappeDoc {
  static override doctype = 'Books Setup Wizard';
  static override presentation = {
    label: 'Setup Wizard',
    fields: { country: { create: false }, currency: { create: false } },
  };
  static override previewMethod = 'preview';

  // The server checks it too; mirrored to show the message at the field.
  validations: ValidationMap = {
    email: validateEmail,
  };

  static lists: ListsMap = {
    chart_of_accounts: (doc) =>
      (doc?.fyo.store.chartsOfAccounts ?? []).map(({ name, label }) => ({
        value: name,
        label,
      })),
  };
}

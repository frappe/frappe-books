import { DocValue } from 'fyo/core/types';
import { FiltersMap, ListViewSettings } from 'fyo/model/types';
import { Field } from 'schemas/types';
import {
  getCompanyRowDescription,
  getCompanyRowValue,
  setCompanyRowValue,
} from 'src/frappe/companyRow';
import { FrappeDoc } from 'src/frappe/document';
import {
  getModeAccountFilters,
  ModeOfPaymentAccount,
} from './ModeOfPaymentAccount';

/** The mode's default account for the current company, kept in its `accounts` row. */
const DEFAULT_ACCOUNT_FIELD = {
  fieldname: 'default_account',
  fieldtype: 'Link',
  label: 'Default Account',
  target: 'Account',
  create: false,
  companyTable: 'accounts',
  after: 'accounts',
} as Field & { after: string };

/** Books Mode of Payment, served by Frappe and named by its Mode of Payment; the server checks its accounts against its type. */
export class ModeOfPayment extends FrappeDoc {
  static override doctype = 'Books Mode of Payment';
  static override presentation = {
    label: 'Mode of Payment',
    quickEditFields: ['type', 'default_account', 'requires_clearance_date'],
    clientFields: [DEFAULT_ACCOUNT_FIELD],
    // The Default Account field edits the current company's row.
    fields: { accounts: { hidden: true } },
  };
  static override rowModels = { accounts: ModeOfPaymentAccount };

  static override filters: FiltersMap = {
    default_account: (doc: FrappeDoc) => getModeAccountFilters(doc.type),
  };

  /** The Default Account field shows the current company's `accounts` row; rows of other companies stay as they are. */
  get default_account(): DocValue {
    return getCompanyRowValue(this, 'accounts', 'default_account');
  }

  set default_account(value: DocValue) {
    setCompanyRowValue(this, 'accounts', 'default_account', value);
  }

  /** With other companies, the Default Account names the company it is for. */
  override getFormFields(fields: Field[]): Field[] {
    const description = getCompanyRowDescription(this);
    return fields.map((field) =>
      field.fieldname === 'default_account' && description
        ? { ...field, sub_label: description }
        : field
    );
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'type'],
    };
  }
}

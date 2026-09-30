import { Fyo, t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { Action, FiltersMap, ListViewSettings } from 'fyo/model/types';
import { getDocStatusListColumn, getLedgerLinkAction } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { Field } from 'schemas/types';
import { QueryFilter } from 'utils/db/types';
import { FrappeDoc } from 'src/frappe/document';
import { PaymentFor } from '../PaymentFor/PaymentFor';
import { TaxSummary } from 'models/invoices/TaxSummary';
import { AccountFieldEnum, PaymentTypeEnum } from './types';

/**
 * Books Payment, served by Frappe. Its `preview` fills the party, type,
 * accounts and amounts that a save would, while the user edits.
 */
export class Payment extends FrappeDoc {
  static override doctype = 'Books Payment';
  static override presentation = {
    label: 'Payment',
    nameField: { label: 'Payment No', hidden: true },
    fields: {
      reference_type: {
        optionLabels: { SalesInvoice: 'Sales', PurchaseInvoice: 'Purchase' },
      },
    },
    quickEditFields: [
      'number_series',
      'party',
      'date',
      'payment_method',
      'account',
      'payment_type',
      'payment_account',
      'reference_id',
      'reference_date',
      'clearance_date',
      'amount',
      'writeoff',
      'amount_paid',
      'attachment',
      'payment_references',
    ],
  };
  static override previewMethod = 'preview';
  static override rowModels = {
    payment_references: PaymentFor,
    taxes: TaxSummary,
  };
  // What Books formulas recalculated after each edit.
  static override refills = {
    party: ['payment_type', 'account'],
    payment_type: ['account', 'payment_account'],
    payment_method: ['payment_account'],
    payment_references: ['amount', 'payment_type'],
  };

  get isTransactional() {
    return true;
  }

  /** Label the accounts by the way money moves, with From Account first. */
  getFormFields(fields: Field[]): Field[] {
    const isPay = this.payment_type === PaymentTypeEnum.Pay;
    const labels = new Map([
      [AccountFieldEnum.Account, isPay ? t`To Account` : t`From Account`],
      [
        AccountFieldEnum.PaymentAccount,
        isPay ? t`From Account` : t`To Account`,
      ],
    ]);
    const formFields = fields.map((field) => {
      const label = labels.get(field.fieldname as AccountFieldEnum);
      return label ? { ...field, label } : field;
    });
    if (!isPay) {
      return formFields;
    }

    const account = formFields.findIndex(
      (field) => field.fieldname === AccountFieldEnum.Account
    );
    const paymentAccount = formFields.findIndex(
      (field) => field.fieldname === AccountFieldEnum.PaymentAccount
    );
    if (account !== -1 && paymentAccount !== -1) {
      [formFields[account], formFields[paymentAccount]] = [
        formFields[paymentAccount],
        formFields[account],
      ];
    }

    return formFields;
  }

  static filters: FiltersMap = {
    party: (doc: Doc) => {
      if (doc.payment_type === PaymentTypeEnum.Pay) {
        return { role: ['in', ['Supplier', 'Both']] } as QueryFilter;
      }

      if (doc.payment_type === PaymentTypeEnum.Receive) {
        return { role: ['in', ['Customer', 'Both']] } as QueryFilter;
      }

      return {};
    },
    number_series: () => ({ reference_type: 'Payment' }),
    account: (doc: Doc) => ({
      account_type:
        doc.payment_type === PaymentTypeEnum.Pay ? 'Payable' : 'Receivable',
      is_group: false,
    }),
    payment_account: async (doc: Doc) => {
      const method = doc.payment_method as string | undefined;
      const type =
        method &&
        (await doc.fyo.getValue(ModelNameEnum.PaymentMethod, method, 'type'));
      if (type === 'Cash') {
        return { account_type: 'Cash', is_group: false };
      }

      return { account_type: ['in', ['Bank', 'Cash']], is_group: false };
    },
  };

  static getActions(fyo: Fyo): Action[] {
    return [getLedgerLinkAction(fyo)];
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', getDocStatusListColumn(), 'party', 'date', 'amount'],
    };
  }
}

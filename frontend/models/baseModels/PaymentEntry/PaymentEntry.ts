import { toActiveDoctype } from 'src/frappe/mode';
import { Fyo } from 'fyo';
import {
  Action,
  ChangeArg,
  FiltersMap,
  HiddenMap,
  ListViewSettings,
} from 'fyo/model/types';
import { getDocStatusListColumn, getLedgerLinkAction } from 'models/helpers';
import { Money } from 'pesa';
import type { Filter } from 'src/frappe/api';
import { getValue } from 'src/frappe/api';
import { FrappeDoc } from 'src/frappe/document';
import type { ClientField } from 'src/frappe/schema';
import { PaymentEntryReference } from './PaymentEntryReference';
import { RealisedTax } from './RealisedTax';
import { PaymentTypeEnum } from './types';

const LEDGER: Filter = ['is_group', '=', 0];

/** The party types a payment or journal row takes, labelled as Books names them. */
export const PARTY_TYPE_OPTIONS = [
  { value: toActiveDoctype('Books Customer'), label: 'Customer' },
  { value: toActiveDoctype('Books Supplier'), label: 'Supplier' },
];

/**
 * Books Payment Entry, served by Frappe. Its `preview` fills the party type,
 * payment type, accounts and amounts that a save would, while the user edits.
 * The form's Write Off is the payment's deductions, kept positive.
 */
export class PaymentEntry extends FrappeDoc {
  static override doctype = 'Books Payment Entry';
  static override presentation = {
    label: 'Payment Entry',
    nameField: { label: 'Payment No', hidden: true },
    fields: {
      party_type: { options: PARTY_TYPE_OPTIONS },
      references: {
        emptyMessage: 'No references. Add a row to allocate this payment.',
      },
    },
    clientFields: [
      {
        fieldname: 'write_off',
        fieldtype: 'Currency',
        label: 'Write Off',
        after: 'paid_amount',
      },
    ] as ClientField[],
    fileFields: [
      'name',
      'naming_series',
      'payment_type',
      'posting_date',
      'party_type',
      'party',
      'mode_of_payment',
      'paid_from',
      'paid_to',
      'paid_amount',
      'reference_no',
      'reference_date',
      'clearance_date',
      'deductions',
      'realised_taxes',
      'references',
      'status',
    ],
    quickEditFields: [
      'naming_series',
      'payment_type',
      'posting_date',
      'party_type',
      'party',
      'mode_of_payment',
      'paid_from',
      'paid_to',
      'paid_amount',
      'write_off',
      'reference_no',
      'reference_date',
      'clearance_date',
      'references',
    ],
  };
  static override previewMethod = 'preview';
  static override partyField = 'party';
  static override rowModels = {
    references: PaymentEntryReference,
    realised_taxes: RealisedTax,
  };
  // What Books formulas recalculated after each edit; see `change` for the party's and the mode's.
  static override refills = {
    party_type: ['payment_type', 'paid_from', 'paid_to'],
    payment_type: ['paid_from', 'paid_to'],
    references: ['paid_amount', 'payment_type'],
  };

  get isTransactional() {
    return true;
  }

  // A transfer moves the company's own money, so nothing is written off.
  hidden: HiddenMap = {
    write_off: () =>
      this.isTransfer || (!this.canEdit && this.write_off.isZero()),
  };

  get isTransfer(): boolean {
    return this.payment_type === PaymentTypeEnum.InternalTransfer;
  }

  /** The deductions as one positive write-off, whatever the payment type. */
  get write_off(): Money {
    return (this.getSum('deductions', 'amount', false) as Money).abs();
  }

  set write_off(value: Money | null) {
    if (!(value ?? this.fyo.pesa(0)).eq(this.write_off)) {
      this.setDeductions(value);
    }
  }

  /** Keeps a write-off as one deduction, negative on a payment out, as ERPNext signs it; the server picks its account. */
  setDeductions(value: Money | null) {
    if (!value || value.isZero() || this.isTransfer) {
      this.deductions = [];
      return;
    }

    const amount =
      this.payment_type === PaymentTypeEnum.Pay ? value.neg() : value;
    const [row] = (this.deductions ?? []) as FrappeDoc[];
    if (!row) {
      this.push('deductions', { amount });
      return;
    }

    row.amount = amount;
    this.deductions = [row];
  }

  override async change(arg: ChangeArg) {
    const { changed } = arg;
    if (changed === 'payment_type') {
      this.setDeductions(this.write_off);
    }

    // The party fills its ledger, the mode of payment the cash or bank account.
    if (changed === 'party') {
      this.leaveToServer([getPartyAccountField(this.payment_type as string)]);
    }

    if (changed === 'mode_of_payment') {
      this.leaveToServer([getPaymentAccountField(this.payment_type as string)]);
    }

    await super.change(arg);
  }

  static filters: FiltersMap = {
    naming_series: () => [['reference_type', '=', 'PaymentEntry']],
    paid_from: (doc: FrappeDoc) =>
      doc.payment_type === PaymentTypeEnum.Receive
        ? [['account_type', '=', 'Receivable'], LEDGER]
        : getPaymentAccountFilters(doc),
    paid_to: (doc: FrappeDoc) => {
      if (doc.payment_type === PaymentTypeEnum.Pay) {
        return [['account_type', '=', 'Payable'], LEDGER];
      }

      return doc.payment_type === PaymentTypeEnum.Receive
        ? getPaymentAccountFilters(doc)
        : [['account_type', 'in', ['Bank', 'Cash']], LEDGER];
    },
  };

  static getActions(fyo: Fyo): Action[] {
    return [getLedgerLinkAction(fyo)];
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'party',
        'posting_date',
        'paid_amount',
      ],
    };
  }
}

/** The field of the party's ledger: money comes from a customer's and goes to a supplier's. */
function getPartyAccountField(paymentType: string): string {
  return paymentType === PaymentTypeEnum.Receive ? 'paid_from' : 'paid_to';
}

/** The field of the cash or bank account that the mode of payment fills, as ERPNext's form does. */
function getPaymentAccountField(paymentType: string): string {
  return paymentType === PaymentTypeEnum.Receive ? 'paid_to' : 'paid_from';
}

/** Cash modes take cash accounts; other modes cash or bank, as the server checks. */
async function getPaymentAccountFilters(doc: FrappeDoc): Promise<Filter[]> {
  const mode = doc.mode_of_payment as string | undefined;
  const type = mode && (await getValue('Books Mode of Payment', mode, 'type'));
  const types = type === 'Cash' ? ['Cash'] : ['Bank', 'Cash'];
  return [['account_type', 'in', types], LEDGER];
}

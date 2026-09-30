import { Fyo, t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import {
  Action,
  ChangeArg,
  DefaultMap,
  FiltersMap,
  FormulaMap,
  HiddenMap,
  ListViewSettings,
} from 'fyo/model/types';
import {
  getDocStatusListColumn,
  getLedgerLinkAction,
  getNumberSeries,
} from 'models/helpers';
import { Transactional } from 'models/Transactional/Transactional';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { Field } from 'schemas/types';
import { QueryFilter } from 'utils/db/types';
import { AccountTypeEnum } from '../Account/types';
import { Invoice } from '../Invoice/Invoice';
import { PaymentFor } from '../PaymentFor/PaymentFor';
import { AccountFieldEnum, PaymentType, PaymentTypeEnum } from './types';
import { BridgeParty, PartyRoleEnum } from '../Party/types';
import { TaxSummary } from '../TaxSummary/TaxSummary';
import { PaymentMethod } from '../PaymentMethod/PaymentMethod';

type AccountTypeMap = Record<AccountTypeEnum, string[] | undefined>;

export class Payment extends Transactional {
  taxes?: TaxSummary[];
  party?: string;
  amount?: Money;
  writeoff?: Money;
  paymentType?: PaymentType;
  paymentMethod?: string;
  referenceType?: ModelNameEnum.SalesInvoice | ModelNameEnum.PurchaseInvoice;
  for?: PaymentFor[];
  _accountsMap?: AccountTypeMap;

  async paymentMethodDoc() {
    return (await this.loadAndGetLink('paymentMethod')) as PaymentMethod | null;
  }

  async change({ changed }: ChangeArg) {
    if (changed === 'for') {
      this.updateAmountOnReferenceUpdate();
      await this.updateDetailsOnReferenceUpdate();
    }

    if (changed === 'amount') {
      this.updateReferenceOnAmountUpdate();
    }
  }

  async updateDetailsOnReferenceUpdate() {
    const forReferences = (this.for ?? []) as Doc[];

    const { referenceType, referenceName } = forReferences[0] ?? {};
    if (
      forReferences.length !== 1 ||
      this.party ||
      this.paymentType ||
      !referenceName ||
      !referenceType
    ) {
      return;
    }

    const schemaName = referenceType as string;
    const doc = (await this.fyo.doc.getDoc(
      schemaName,
      referenceName as string
    )) as Invoice;

    this.party = doc.party as string;
    this.paymentType = getPaymentType(doc);
  }

  updateAmountOnReferenceUpdate() {
    this.amount = this.fyo.pesa(0);
    for (const paymentReference of (this.for ?? []) as Doc[]) {
      this.amount = this.amount.add(paymentReference.amount as Money);
    }
  }

  updateReferenceOnAmountUpdate() {
    const forReferences = (this.for ?? []) as Doc[];
    if (forReferences.length !== 1) {
      return;
    }

    forReferences[0].amount = this.amount;
  }

  static defaults: DefaultMap = {
    numberSeries: (doc) => getNumberSeries(doc.schemaName, doc.fyo),
  };

  /** Label the accounts by the way money moves, with From Account first. */
  getFormFields(fields: Field[]): Field[] {
    const isPay = this.paymentType === PaymentTypeEnum.Pay;
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

  async _getAccountsMap(): Promise<AccountTypeMap> {
    if (this._accountsMap) {
      return this._accountsMap;
    }

    const accounts = (await this.fyo.db.getAll(ModelNameEnum.Account, {
      fields: ['name', 'accountType'],
      filters: {
        isGroup: false,
        accountType: [
          'in',
          [
            AccountTypeEnum.Bank,
            AccountTypeEnum.Cash,
            AccountTypeEnum.Payable,
            AccountTypeEnum.Receivable,
          ],
        ],
      },
    })) as { name: string; accountType: AccountTypeEnum }[];

    return (this._accountsMap = accounts.reduce((acc, ac) => {
      acc[ac.accountType] ??= [];
      acc[ac.accountType]!.push(ac.name);
      return acc;
    }, {} as AccountTypeMap));
  }

  async _getReferenceAccount() {
    const account = await this._getAccountFromParty();
    if (!account) {
      return await this._getAccountFromFor();
    }

    return account;
  }

  async _getAccountFromParty() {
    const party = (await this.loadAndGetLink('party')) as BridgeParty | null;
    if (!party || party.role === 'Both') {
      return null;
    }

    return party.defaultAccount ?? null;
  }

  async _getAccountFromFor() {
    const reference = this?.for?.[0];
    if (!reference) {
      return null;
    }

    const refDoc = (await reference.loadAndGetLink(
      'referenceName'
    )) as Invoice | null;

    return refDoc?.account ?? null;
  }

  formulas: FormulaMap = {
    account: {
      formula: async () => {
        const accountsMap = await this._getAccountsMap();
        const accountType =
          this.paymentType === PaymentTypeEnum.Pay
            ? AccountTypeEnum.Payable
            : AccountTypeEnum.Receivable;
        return (
          (await this._getReferenceAccount()) ??
          accountsMap[accountType]?.[0] ??
          null
        );
      },
      dependsOn: ['paymentType', 'party'],
    },
    paymentAccount: {
      formula: async () => {
        const paymentMethodDoc = await this.paymentMethodDoc();
        if (!paymentMethodDoc) {
          return;
        }

        // Like Electron Books, only receipts default to the method's account.
        const isPay = this.paymentType === PaymentTypeEnum.Pay;
        if (paymentMethodDoc.account && !isPay) {
          return paymentMethodDoc.get('account');
        }

        const accountsMap = await this._getAccountsMap();
        if (paymentMethodDoc.type === 'Cash') {
          return accountsMap[AccountTypeEnum.Cash]?.[0] ?? null;
        }

        return accountsMap[AccountTypeEnum.Bank]?.[0] ?? null;
      },
      dependsOn: ['paymentMethod', 'paymentType'],
    },
    paymentType: {
      formula: async () => {
        if (!this.party) {
          return;
        }

        const invoice = (await this.for?.[0]?.loadAndGetLink(
          'referenceName'
        )) as Invoice | null;
        if (invoice) {
          return getPaymentType(invoice);
        }

        const party = (await this.loadAndGetLink('party')) as BridgeParty;
        if (party.role === PartyRoleEnum.Both) {
          return this.paymentType ?? PaymentTypeEnum.Receive;
        }

        return party.role === PartyRoleEnum.Supplier
          ? PaymentTypeEnum.Pay
          : PaymentTypeEnum.Receive;
      },
    },
    amount: {
      formula: () => this.getSum('for', 'amount', false),
      dependsOn: ['for'],
    },
    amountPaid: {
      formula: () => this.amount!.sub(this.writeoff!),
      dependsOn: ['amount', 'writeoff', 'for'],
    },
    referenceType: {
      formula: () => {
        return this.referenceType || undefined;
      },
      dependsOn: ['for'],
    },
  };

  hidden: HiddenMap = {
    amountPaid: () => this.writeoff?.isZero() ?? true,
    attachment: () =>
      !(this.attachment || !(this.isSubmitted || this.isCancelled)),
    for: () => !!((this.isSubmitted || this.isCancelled) && !this.for?.length),
    taxes: () => !this.taxes?.length,
  };

  static filters: FiltersMap = {
    party: (doc: Doc) => {
      const paymentType = (doc as Payment).paymentType;
      if (paymentType === 'Pay') {
        return { role: ['in', ['Supplier', 'Both']] } as QueryFilter;
      }

      if (paymentType === 'Receive') {
        return { role: ['in', ['Customer', 'Both']] } as QueryFilter;
      }

      return {};
    },
    numberSeries: () => {
      return { referenceType: 'Payment' };
    },
    account: (doc: Doc) => ({
      accountType:
        doc.paymentType === PaymentTypeEnum.Pay ? 'Payable' : 'Receivable',
      isGroup: false,
    }),
    paymentAccount: async (doc: Doc) => {
      const method = doc.paymentMethod as string | undefined;
      const type =
        method &&
        (await doc.fyo.getValue(ModelNameEnum.PaymentMethod, method, 'type'));
      if (type === 'Cash') {
        return { accountType: 'Cash', isGroup: false };
      }

      return { accountType: ['in', ['Bank', 'Cash']], isGroup: false };
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

/** Money comes in for sales and purchase returns, and goes out otherwise. */
export function getPaymentType(invoice: Invoice): PaymentTypeEnum {
  return invoice.isSales !== invoice.isReturn
    ? PaymentTypeEnum.Receive
    : PaymentTypeEnum.Pay;
}

import { Fyo } from 'fyo';
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
import { QueryFilter } from 'utils/db/types';
import { AccountTypeEnum } from '../Account/types';
import { Invoice } from '../Invoice/Invoice';
import { Party } from '../Party/Party';
import { PaymentFor } from '../PaymentFor/PaymentFor';
import { PaymentType, PaymentTypeEnum } from './types';
import { PartyRoleEnum } from '../Party/types';
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
    return (await this.loadAndGetLink('paymentMethod')) as PaymentMethod;
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
    date: () => new Date(),
  };

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
    const party = (await this.loadAndGetLink('party')) as Party | null;
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

    if (
      refDoc &&
      refDoc.schema.name === ModelNameEnum.SalesInvoice &&
      refDoc.isReturned
    ) {
      const accountsMap = await this._getAccountsMap();
      return accountsMap[AccountTypeEnum.Cash]?.[0];
    }

    return refDoc?.account ?? null;
  }

  formulas: FormulaMap = {
    account: {
      formula: async () => {
        const accountsMap = await this._getAccountsMap();
        if (this.paymentType === 'Receive') {
          return (
            (await this._getReferenceAccount()) ??
            accountsMap[AccountTypeEnum.Receivable]?.[0] ??
            null
          );
        }

        const paymentMethodDoc = await this.paymentMethodDoc();

        if (paymentMethodDoc.type === 'Cash') {
          return accountsMap[AccountTypeEnum.Cash]?.[0] ?? null;
        }

        return accountsMap[AccountTypeEnum.Bank]?.[0] ?? null;
      },
      dependsOn: ['paymentMethod', 'paymentType', 'party'],
    },
    paymentAccount: {
      formula: async () => {
        const accountsMap = await this._getAccountsMap();
        if (this.paymentType === 'Pay') {
          return (
            (await this._getReferenceAccount()) ??
            accountsMap[AccountTypeEnum.Payable]?.[0] ??
            null
          );
        }

        const paymentMethodDoc = await this.paymentMethodDoc();

        if (paymentMethodDoc.account) {
          return paymentMethodDoc.get('account');
        }

        if (paymentMethodDoc.type === 'Cash') {
          return accountsMap[AccountTypeEnum.Cash]?.[0] ?? null;
        }

        return accountsMap[AccountTypeEnum.Bank]?.[0] ?? null;
      },
      dependsOn: ['paymentMethod', 'paymentType', 'party'],
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

        const party = (await this.loadAndGetLink('party')) as Party;
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
    account: (doc: Doc) => {
      const paymentType = doc.paymentType as PaymentType;
      const paymentMethod = doc.paymentMethod as PaymentMethod;

      if (paymentType === 'Receive') {
        return { accountType: 'Receivable', isGroup: false };
      }

      if (paymentMethod.name === 'Cash') {
        return { accountType: 'Cash', isGroup: false };
      } else {
        return { accountType: ['in', ['Bank', 'Cash']], isGroup: false };
      }
    },
    paymentAccount: (doc: Doc) => {
      const paymentType = doc.paymentType as PaymentType;
      const paymentMethod = doc.paymentMethod as PaymentMethod;

      if (paymentType === 'Pay') {
        return { accountType: 'Payable', isGroup: false };
      }

      if (paymentMethod.name === 'Cash') {
        return { accountType: 'Cash', isGroup: false };
      } else {
        return { accountType: ['in', ['Bank', 'Cash']], isGroup: false };
      }
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

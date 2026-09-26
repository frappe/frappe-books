import { Fyo, t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import {
  Action,
  ChangeArg,
  DefaultMap,
  FiltersMap,
  FormulaMap,
  HiddenMap,
  ListViewSettings,
  ValidationMap,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
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
import { getPaymentMethodRequirements } from '../PaymentMethod/requirements';

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

  async validate() {
    await super.validate();
    if (this.submitted) {
      return;
    }

    await this.validateFor();
    this.validateAccounts();
    this.validateTotalReferenceAmount();
    await this.validateReferences();
    await this.validateReferencesAreSet();
  }

  async validateFor() {
    for (const childDoc of this.for ?? []) {
      const referenceName = childDoc.referenceName;
      const referenceType = childDoc.referenceType;

      const refDoc = (await this.fyo.doc.getDoc(
        childDoc.referenceType!,
        childDoc.referenceName
      )) as Invoice;

      if (referenceName && referenceType && !refDoc) {
        throw new ValidationError(
          t`${referenceType} of type ${
            this.fyo.schemaMap?.[referenceType]?.label ?? referenceType
          } does not exist`
        );
      }

      if (!refDoc) {
        continue;
      }

      if (refDoc?.party !== this.party) {
        throw new ValidationError(
          t`${refDoc.name!} party ${refDoc.party!} is different from ${
            this.party!
          }`
        );
      }
    }
  }

  validateAccounts() {
    if (this.paymentAccount !== this.account || !this.account) {
      return;
    }

    throw new this.fyo.errors.ValidationError(
      t`To Account and From Account can't be the same: ${
        this.account as string
      }`
    );
  }

  validateTotalReferenceAmount() {
    const forReferences = (this.for ?? []) as Doc[];
    if (forReferences.length === 0) {
      return;
    }

    const referenceAmountTotal = forReferences
      .map(({ amount }) => amount as Money)
      .reduce((a, b) => a.add(b), this.fyo.pesa(0));

    if ((this.amount as Money).gte(referenceAmountTotal)) {
      return;
    }

    const payment = this.fyo.format(this.amount!, 'Currency');
    const refAmount = this.fyo.format(referenceAmountTotal, 'Currency');

    throw new ValidationError(
      this.fyo.t`Amount: ${payment} is less than the total
        amount allocated to references: ${refAmount}.`
    );
  }

  async validateReferencesAreSet() {
    const paymentMethod = await this.paymentMethodDoc();
    const requirements = getPaymentMethodRequirements(
      paymentMethod.type,
      paymentMethod.requiresClearanceDate
    );

    if (requirements.requiresClearanceDate && !this.clearanceDate) {
      throw new ValidationError(t`Clearance Date not set.`);
    }

    if (requirements.requiresReferenceId && !this.referenceId) {
      throw new ValidationError(t`Reference Id not set.`);
    }
  }

  async validateReferences() {
    const forReferences = this.for ?? [];
    if (forReferences.length === 0) {
      return;
    }

    for (const row of forReferences) {
      this.validateReferenceType(row);
    }

    await this.validateReferenceOutstanding();
  }

  validateReferenceType(row: PaymentFor) {
    const referenceType = row.referenceType;
    if (
      ![ModelNameEnum.SalesInvoice, ModelNameEnum.PurchaseInvoice].includes(
        referenceType!
      )
    ) {
      throw new ValidationError(t`Please select a valid reference type.`);
    }
  }

  async getReferenceOutstandingAmount() {
    let outstandingAmount = this.fyo.pesa(0);
    for (const row of this.for ?? []) {
      if (!row.referenceType || !row.referenceName) {
        continue;
      }
      const referenceDoc = (await this.fyo.doc.getDoc(
        row.referenceType as string,
        row.referenceName as string
      )) as Invoice;

      outstandingAmount = outstandingAmount.add(
        referenceDoc.outstandingAmount?.abs() ?? 0
      );
    }
    return outstandingAmount;
  }

  async validateReferenceOutstanding() {
    const outstandingAmount = await this.getReferenceOutstandingAmount();
    const amount = this.amount as Money;

    if (amount.gt(0) && amount.lte(outstandingAmount)) {
      return;
    }

    let message = this.fyo.t`Payment amount: ${this.fyo.format(
      this.amount!,
      'Currency'
    )} should be less than Outstanding amount: ${this.fyo.format(
      outstandingAmount,
      'Currency'
    )}.`;

    if (amount.lte(0)) {
      const amt = this.fyo.format(this.amount!, 'Currency');
      message = this.fyo.t`Payment amount: ${amt} should be greater than 0.`;
    }

    throw new ValidationError(message);
  }

  async beforeSync(): Promise<void> {
    await super.beforeSync();
    const totalAmount = await this.getReferenceOutstandingAmount();

    for (const row of this.for ?? []) {
      if (!this.fyo.singles.AccountingSettings?.enablePartialPayment) {
        const amount = (this.writeoff as Money).isZero()
          ? (this.amount as Money)
          : (this.amountPaid as Money);

        if (amount.lt(totalAmount)) {
          if (this.writeoff?.isZero()) {
            this.amount = totalAmount;
            row.amountPaid = this.fyo.pesa(0);
            throw new ValidationError(
              this.fyo.t`Enable Partial payment to pay partial amount`
            );
          }
        }
      }
    }
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

  validations: ValidationMap = {
    amount: async (value: DocValue) => {
      if ((value as Money).isNegative()) {
        throw new ValidationError(
          this.fyo.t`Payment amount cannot be less than zero.`
        );
      }

      if (((this.for ?? []) as Doc[]).length === 0) {
        return;
      }

      const totalAmount = await this.getReferenceOutstandingAmount();

      if ((value as Money).gt(totalAmount)) {
        throw new ValidationError(
          this.fyo.t`Payment amount cannot exceed ${this.fyo.format(
            totalAmount,
            'Currency'
          )}.`
        );
      } else if ((value as Money).isZero()) {
        throw new ValidationError(
          this.fyo.t`Payment amount cannot be ${this.fyo.format(
            value as Money,
            'Currency'
          )}.`
        );
      }
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

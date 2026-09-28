import { Doc } from 'fyo/model/doc';
import { ListViewSettings } from 'fyo/model/types';
import { Money } from 'pesa';

export class AccountingLedgerEntry extends Doc {
  date?: string | Date;
  account?: string;
  party?: string;
  debit?: Money;
  credit?: Money;
  referenceType?: string;
  referenceName?: string;
  reverted?: boolean;

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['date', 'account', 'party', 'debit', 'credit', 'referenceName'],
    };
  }
}

import { Fyo } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { ValidationError } from 'fyo/utils/errors';
import {
  DefaultMap,
  FiltersMap,
  ListViewSettings,
  RequiredMap,
  TreeViewSettings,
  ReadOnlyMap,
  FormulaMap,
} from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { QueryFilter } from 'utils/db/types';
import { AccountRootType, AccountRootTypeEnum, AccountType } from './types';

export class Account extends Doc {
  rootType?: AccountRootType;
  accountType?: AccountType;
  parentAccount?: string;

  get isDebit() {
    if (this.rootType === AccountRootTypeEnum.Asset) {
      return true;
    }

    if (this.rootType === AccountRootTypeEnum.Expense) {
      return true;
    }

    return false;
  }

  get isCredit() {
    return !this.isDebit;
  }

  required: RequiredMap = {
    parentAccount: () =>
      !this.isGroup && !!this.fyo.singles?.AccountingSettings?.setupComplete,
  };

  static defaults: DefaultMap = {
    /**
     * NestedSet indices are actually not used
     * this needs updation as they may be required
     * later on.
     */
    lft: () => 0,
    rgt: () => 0,
  };

  async beforeDelete() {
    if (!this.parentAccount) {
      throw new ValidationError(this.fyo.t`Root accounts cannot be deleted.`);
    }
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'rootType', 'isGroup', 'parentAccount'],
    };
  }

  static getTreeSettings(fyo: Fyo): void | TreeViewSettings {
    return {
      parentField: 'parentAccount',
      async getRootLabel(): Promise<string> {
        const accountingSettings = await fyo.doc.getDoc('AccountingSettings');
        return accountingSettings.companyName as string;
      },
    };
  }

  formulas: FormulaMap = {
    rootType: {
      formula: async () => {
        if (!this.parentAccount) {
          return;
        }

        return await this.fyo.getValue(
          ModelNameEnum.Account,
          this.parentAccount,
          'rootType'
        );
      },
    },
  };

  static filters: FiltersMap = {
    parentAccount: (doc: Doc) => {
      const filter: QueryFilter = {
        isGroup: true,
      };

      if (doc?.rootType) {
        filter.rootType = doc.rootType as string;
      }

      return filter;
    },
  };

  readOnly: ReadOnlyMap = {
    rootType: () => this.inserted,
    parentAccount: () => this.inserted,
    accountType: () => !!this.accountType && this.inserted,
    isGroup: () => this.inserted,
  };
}

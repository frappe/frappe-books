import { Fyo } from 'fyo';
import {
  FiltersMap,
  ListViewSettings,
  TreeViewSettings,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import type { Filter } from 'src/frappe/api';
import { FrappeDoc } from 'src/frappe/document';

/**
 * Books Account, served by Frappe. The DocType owns its fields and rules;
 * its `preview` fills the types a child account takes from its group.
 */
export class Account extends FrappeDoc {
  static override doctype = 'Books Account';
  static override presentation = {
    label: 'Account',
    create: false,
    // Frappe moves the nested set as accounts are added; a client copy would be stale.
    // GST Head is Indian; see the Indian Account.
    omitFields: ['lft', 'rgt', 'old_parent', 'gst_head'],
    quickEditFields: [
      'root_type',
      'parent_books_account',
      'account_type',
      'is_group',
    ],
    fields: { parent_books_account: { create: false } },
  };
  static override previewMethod = 'preview';

  // The server refuses this too; checked here to say so before asking it.
  async beforeDelete() {
    if (!this.parent_books_account) {
      throw new ValidationError(this.fyo.t`Root accounts cannot be deleted.`);
    }
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'root_type', 'is_group', 'parent_books_account'],
    };
  }

  static getTreeSettings(fyo: Fyo): void | TreeViewSettings {
    return {
      parentField: 'parent_books_account',
      getRootLabel(): Promise<string> {
        return Promise.resolve(
          fyo.singles.AccountingSettings?.company_name ?? ''
        );
      },
    };
  }

  static filters: FiltersMap = {
    parent_books_account: (doc: FrappeDoc) => {
      const filters: Filter[] = [['is_group', '=', 1]];
      if (doc?.root_type) {
        filters.push(['root_type', '=', doc.root_type]);
      }

      return filters;
    },
  };
}

import { t } from 'fyo';
import { EmptyMessageMap, ListViewSettings, ListsMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';

/**
 * Books Address, served by Frappe. The server writes its display text and,
 * for an Indian address, its place of supply.
 */
export class Address extends FrappeDoc {
  static override doctype = 'Books Address';
  static override presentation = {
    label: 'Address',
    nameField: { label: 'Address Name' },
    quickEditFields: [
      'address_line1',
      'address_line2',
      'city',
      'country',
      'state',
      'postal_code',
    ],
    linkDisplayField: 'address_display',
    fields: { country: { create: false } },
    // Place of supply is an Indian GST field; see the Indian Address.
    omitFields: ['pos'],
  };

  static lists: ListsMap = {
    state(doc?: FrappeDoc) {
      const country = doc?.country as string | undefined;
      switch (country) {
        case 'India':
          return Object.values(doc?.fyo.store.indianStates ?? {}).sort();
        default:
          return [] as string[];
      }
    },
  };

  static emptyMessages: EmptyMessageMap = {
    state: (doc: FrappeDoc) => {
      if (doc.country) {
        return t`Enter State`;
      }

      return t`Enter Country to load States`;
    },
  };

  static override getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'address_line1', 'city', 'state', 'country'],
    };
  }
}

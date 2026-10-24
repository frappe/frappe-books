import { t } from 'fyo';
import { EmptyMessageMap, ListViewSettings, ListsMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import type { Presentation } from 'src/frappe/schema';

/** The states an address in its country offers: India's, else none, as the state is then free text. */
export function getStates(doc?: FrappeDoc): string[] {
  if (doc?.country !== 'India') {
    return [];
  }

  return Object.values(doc.fyo.store.indianStates ?? {}).sort();
}

/** Frappe's Address, which parties, locations and print settings link to. */
export class Address extends FrappeDoc {
  static override doctype = 'Address';
  static override presentation: Presentation = {
    label: 'Address',
    titleField: 'address_title',
    quickEditFields: [
      'address_title',
      'address_type',
      'address_line1',
      'address_line2',
      'city',
      'country',
      'state',
      'pincode',
    ],
    fields: {
      // Frappe requires a type; Books' addresses are billing addresses unless chosen.
      address_type: { default: 'Billing' },
      country: { create: false },
      // Frappe stores the state as text; Books offers the Indian states for India.
      state: { fieldtype: 'AutoComplete', options: [] },
    },
  };

  static lists: ListsMap = { state: getStates };

  static emptyMessages: EmptyMessageMap = {
    state: (doc: FrappeDoc) => {
      if (doc.country) {
        return t`Enter state`;
      }

      return t`Enter country to load states`;
    },
  };

  static override getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'address_line1', 'city', 'state', 'country'],
    };
  }
}

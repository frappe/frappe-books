import { t } from 'fyo';
import { EmptyMessageMap, ListViewSettings, ListsMap } from 'fyo/model/types';
import { FrappeDoc, type LinkCard } from 'src/frappe/document';
import type { DocValues } from 'src/frappe/api';
import type { Presentation } from 'src/frappe/schema';

/** The states an address in its country offers: India's, else none, as the state is then free text. */
export function getStates(doc?: FrappeDoc): string[] {
  if (doc?.country !== 'India') {
    return [];
  }

  return Object.values(doc.fyo.store.indianStates ?? {}).sort();
}

/** e.g. `Pune, Maharashtra 411001, India`. */
function getPlace(address: DocValues): string {
  const region = join(address, ['state', 'pincode'], ' ');
  return [address.city, region, address.country].filter(Boolean).join(', ');
}

function join(values: DocValues, fieldnames: string[], separator: string) {
  return fieldnames
    .map((fieldname) => values[fieldname])
    .filter(Boolean)
    .join(separator);
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

  // A party's primary address shows by name, its lines, then its place.
  static override linkCard: LinkCard = {
    fields: [
      'address_line1',
      'address_line2',
      'city',
      'state',
      'pincode',
      'country',
    ],
    getContent: (address) => ({
      title: String(address.name),
      lines: [
        { text: join(address, ['address_line1', 'address_line2'], ', ') },
        { text: getPlace(address) },
      ].filter(({ text }) => text),
    }),
  };

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

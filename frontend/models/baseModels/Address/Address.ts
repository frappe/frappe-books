import { t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { EmptyMessageMap, ListViewSettings, ListsMap } from 'fyo/model/types';
import { codeStateMap } from 'regional/in';
import { getCountryInfo } from 'utils/misc';

export class Address extends Doc {
  static lists: ListsMap = {
    state(doc?: Doc) {
      const country = doc?.country as string | undefined;
      switch (country) {
        case 'India':
          return Object.values(codeStateMap).sort();
        default:
          return [] as string[];
      }
    },
    country() {
      return Object.keys(getCountryInfo()).sort();
    },
  };

  static emptyMessages: EmptyMessageMap = {
    state: (doc: Doc) => {
      if (doc.country) {
        return t`Enter State`;
      }

      return t`Enter Country to load States`;
    },
  };

  static override getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'addressLine1', 'city', 'state', 'country'],
    };
  }
}

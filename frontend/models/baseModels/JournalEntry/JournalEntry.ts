import { Fyo } from 'fyo';
import { Doc } from 'fyo/model/doc';
import {
  Action,
  DefaultMap,
  FiltersMap,
  HiddenMap,
  ListViewSettings,
} from 'fyo/model/types';
import {
  getDocStatusListColumn,
  getLedgerLinkAction,
  getNumberSeries,
} from 'models/helpers';
import { Transactional } from 'models/Transactional/Transactional';

export class JournalEntry extends Transactional {
  accounts?: Doc[];

  hidden: HiddenMap = {
    referenceNumber: () =>
      !(this.referenceNumber || !(this.isSubmitted || this.isCancelled)),
    referenceDate: () =>
      !(this.referenceDate || !(this.isSubmitted || this.isCancelled)),
    userRemark: () =>
      !(this.userRemark || !(this.isSubmitted || this.isCancelled)),
    attachment: () =>
      !(this.attachment || !(this.isSubmitted || this.isCancelled)),
  };

  static defaults: DefaultMap = {
    numberSeries: (doc) => getNumberSeries(doc.schemaName, doc.fyo),
  };

  static filters: FiltersMap = {
    numberSeries: () => ({ reference_type: 'JournalEntry' }),
  };

  static getActions(fyo: Fyo): Action[] {
    return [getLedgerLinkAction(fyo)];
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        getDocStatusListColumn(),
        'date',
        'entryType',
        'referenceNumber',
      ],
    };
  }
}

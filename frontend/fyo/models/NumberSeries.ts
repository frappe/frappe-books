import { Doc } from 'fyo/model/doc';
import { ReadOnlyMap } from 'fyo/model/types';

export default class NumberSeries extends Doc {
  readOnly: ReadOnlyMap = {
    referenceType: () => this.inserted,
    padZeros: () => this.inserted,
    start: () => this.inserted,
  };
}

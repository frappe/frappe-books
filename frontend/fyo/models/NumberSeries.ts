import { Doc } from 'fyo/model/doc';
import { ReadOnlyMap, ValidationMap } from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';

const invalidNumberSeries = /[/\=\?\&\%]/;

export default class NumberSeries extends Doc {
  validations: ValidationMap = {
    name: (value) => {
      if (typeof value !== 'string') {
        return;
      }

      if (invalidNumberSeries.test(value)) {
        throw new ValidationError(
          this.fyo
            .t`The following characters cannot be used ${'/, ?, &, =, %'} in a Number Series name.`
        );
      }
    },
  };

  readOnly: ReadOnlyMap = {
    referenceType: () => this.inserted,
    padZeros: () => this.inserted,
    start: () => this.inserted,
  };
}

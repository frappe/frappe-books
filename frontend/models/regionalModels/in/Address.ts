import { Address as BaseAddress } from 'models/baseModels/Address/Address';

export class Address extends BaseAddress {
  static override presentation = {
    ...BaseAddress.presentation,
    quickEditFields: [...BaseAddress.presentation.quickEditFields, 'pos'],
    omitFields: [],
  };
}

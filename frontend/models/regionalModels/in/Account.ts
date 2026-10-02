import { Account as BaseAccount } from 'models/baseModels/Account/Account';

/** An Indian account: it names the GST head it holds for the GSTR reports. */
export class Account extends BaseAccount {
  static override presentation = {
    ...BaseAccount.presentation,
    omitFields: ['lft', 'rgt', 'old_parent'],
    quickEditFields: [...BaseAccount.presentation.quickEditFields, 'gst_head'],
  };
}

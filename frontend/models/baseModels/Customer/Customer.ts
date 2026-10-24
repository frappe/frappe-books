import { Fyo } from 'fyo';
import { Action, HiddenMap } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { getFrappeDoc } from 'src/frappe/documents';
import type { Presentation } from 'src/frappe/schema';
import { getPartyActions, getPartyPresentation, Party } from '../Party/Party';

/** Books Customer. The server marks the lead it came from converted. */
export class Customer extends Party {
  static override doctype = 'Books Customer';
  static override presentation: Presentation = {
    ...getPartyPresentation('Customer', [
      'email',
      'phone',
      'address',
      'default_account',
      'loyalty_program',
      'default_currency',
      'tax_id',
    ]),
    fields: { lead_name: { create: false } },
  };
  static override accountType = 'Receivable' as const;

  lead_name?: string;
  declare loyalty_program?: string;

  // Loyalty shows while the program is on.
  hidden: HiddenMap = {
    loyalty_program: () =>
      !this.fyo.singles.AccountingSettings?.enable_loyalty_program,
    loyalty_points: () => !this.loyalty_program,
  };

  async afterDelete() {
    await super.afterDelete();
    await this.reloadLead();
  }

  async afterSync() {
    await this.reloadLead();
  }

  /** Shows the lead status the server set when this customer was saved or deleted. */
  async reloadLead() {
    if (this.lead_name) {
      await getFrappeDoc(ModelNameEnum.Lead, this.lead_name, { refresh: true });
    }
  }

  static getActions(fyo: Fyo): Action[] {
    return getPartyActions(fyo, {
      schemaName: ModelNameEnum.SalesInvoice,
      mapper: 'make_sales_invoice',
      createLabel: fyo.t`Create sale`,
      viewLabel: fyo.t`View sales`,
    });
  }
}

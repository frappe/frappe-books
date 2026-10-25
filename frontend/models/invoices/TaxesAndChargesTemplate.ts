import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import type { Presentation } from 'src/frappe/schema';
import { TaxesAndCharges } from './TaxesAndCharges';

/** A Taxes and Charges Template: the tax rows an invoice or quote starts from, named by its title. */
abstract class TaxesAndChargesTemplate extends FrappeDoc {
  static override rowModels = { taxes: TaxesAndCharges };

  static getListViewSettings(): ListViewSettings {
    return { columns: ['name', 'is_default'] };
  }
}

/**
 * The rows show no amounts: a template has none until an invoice applies it.
 * ERPNext's templates belong to a company, which accessory mode shows;
 * standalone Books has one.
 */
function getTemplatePresentation(label: string): Presentation {
  return {
    label,
    fields: {
      company: { hidden: false, readOnly: false },
      taxes: {
        tableFields: ['charge_type', 'account_head', 'rate'],
        mobileTableFields: ['account_head', 'charge_type', 'rate'],
      },
    },
  };
}

export class SalesTaxesAndChargesTemplate extends TaxesAndChargesTemplate {
  static override doctype = 'Books Sales Taxes and Charges Template';
  static override presentation = getTemplatePresentation(
    'Sales Taxes and Charges Template'
  );
}

export class PurchaseTaxesAndChargesTemplate extends TaxesAndChargesTemplate {
  static override doctype = 'Books Purchase Taxes and Charges Template';
  static override presentation = getTemplatePresentation(
    'Purchase Taxes and Charges Template'
  );
}

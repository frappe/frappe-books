import { FrappeDoc } from 'src/frappe/document';

/** A Books Item Tax Template Detail row: a tax account and rate of a tax template. */
export class ItemTaxTemplateDetail extends FrappeDoc {
  static override presentation = { label: 'Tax Template Detail' };
}

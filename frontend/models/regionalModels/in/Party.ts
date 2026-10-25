import { Customer as BaseCustomer } from 'models/baseModels/Customer/Customer';
import { Supplier as BaseSupplier } from 'models/baseModels/Supplier/Supplier';
import type { Presentation } from 'src/frappe/schema';

/** An Indian customer or supplier: GST registration instead of a tax ID. */
function withGst(presentation: Presentation): Presentation {
  const quickEditFields = presentation.quickEditFields ?? [];
  return {
    ...presentation,
    quickEditFields: [
      ...quickEditFields.filter((fieldname) => fieldname !== 'tax_id'),
      'gst_category',
      'gstin',
    ],
    omitFields: ['tax_id'],
  };
}

export class Customer extends BaseCustomer {
  static override presentation = withGst(BaseCustomer.presentation);
}

export class Supplier extends BaseSupplier {
  static override presentation = withGst(BaseSupplier.presentation);
}

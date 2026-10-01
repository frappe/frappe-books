import { ModelNameEnum } from 'models/types';
import { getDocTypes } from 'src/frappe/doctypes';

// Books' own records, which have no form to customize.
const UNCUSTOMIZABLE: string[] = [
  ModelNameEnum.CustomField,
  ModelNameEnum.CustomForm,
  ModelNameEnum.SetupWizard,
];

/** The doctypes a Custom Form can add fields to, or link a field to, by the label /books shows. */
export function getCustomizableForms(): { value: string; label: string }[] {
  return getDocTypes()
    .filter(
      ({ schema }) =>
        !!schema.label &&
        !schema.isSingle &&
        !UNCUSTOMIZABLE.includes(schema.name)
    )
    .map(({ doctype, schema }) => ({ value: doctype, label: schema.label! }));
}

import { ModelNameEnum } from 'models/types';
import { Schema } from 'schemas/types';
import { getDocTypes } from 'src/frappe/doctypes';

// Books' own records, which have no form to customize.
const UNCUSTOMIZABLE: string[] = [
  ModelNameEnum.CustomField,
  ModelNameEnum.CustomForm,
  ModelNameEnum.SetupWizard,
];

/** The schemas a Custom Form can add fields to, or link a field to. */
export function getCustomizableSchemas(): Schema[] {
  return getDocTypes()
    .map(({ schema }) => schema)
    .filter(
      (schema) =>
        !!schema.label &&
        !schema.isSingle &&
        !UNCUSTOMIZABLE.includes(schema.name)
    );
}

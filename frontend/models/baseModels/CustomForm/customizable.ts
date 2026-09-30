import { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { Schema } from 'schemas/types';

// Books' own records, which have no form to customize.
const UNCUSTOMIZABLE: string[] = [
  ModelNameEnum.SingleValue,
  ModelNameEnum.CustomField,
  ModelNameEnum.CustomForm,
  ModelNameEnum.SetupWizard,
];

/** The schemas a Custom Form can add fields to, or link a field to. */
export function getCustomizableSchemas(fyo: Fyo): Schema[] {
  return Object.values(fyo.schemaMap).filter(
    (schema): schema is Schema =>
      !!schema?.label &&
      !schema.isSingle &&
      !UNCUSTOMIZABLE.includes(schema.name)
  );
}

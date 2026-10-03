import { ModelNameEnum } from 'models/types';
import { getDocTypes, type FrappeDocType } from 'src/frappe/doctypes';

// Books' own records, which have no form to customize.
const UNCUSTOMIZABLE: string[] = [
  ModelNameEnum.CustomField,
  ModelNameEnum.CustomForm,
  ModelNameEnum.SetupWizard,
];
// Ledgers the server does not let a Custom Form change.
const LEDGERS: string[] = [
  ModelNameEnum.AccountingLedgerEntry,
  ModelNameEnum.LoyaltyPointEntry,
  ModelNameEnum.StockLedgerEntry,
];

/** The doctypes a Custom Form can add fields to, as the server allows: Books forms and their rows. */
export function getCustomizableForms(): { value: string; label: string }[] {
  const settingsTables = getSettingsTables();
  return getForms(
    ({ meta, schema }) =>
      meta.module === 'Frappe Books' &&
      !LEDGERS.includes(schema.name) &&
      !settingsTables.has(schema.name)
  );
}

/** The rows of settings, which are singles. */
function getSettingsTables(): Set<string> {
  return new Set(
    getDocTypes()
      .filter(({ schema }) => schema.isSingle)
      .flatMap(({ tables }) => Object.values(tables))
      .map((table) => table!.schema.name)
  );
}

/** The doctypes a custom Link can link to; a custom Table holds rows of a child table. */
export function getTargets(
  fieldtype?: string
): { value: string; label: string }[] {
  return getForms(({ schema }) => fieldtype !== 'Table' || !!schema.isChild);
}

function getForms(filter: (docType: FrappeDocType) => boolean) {
  return getDocTypes()
    .filter(
      ({ schema }) =>
        !!schema.label &&
        !schema.isSingle &&
        !UNCUSTOMIZABLE.includes(schema.name)
    )
    .filter(filter)
    .map(({ doctype, schema }) => ({ value: doctype, label: schema.label! }));
}

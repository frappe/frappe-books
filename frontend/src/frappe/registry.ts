import type { Doc } from 'fyo/model/doc';
import { translateSchema, TranslationString } from 'fyo/utils/translation';
import type { Field, Schema } from 'schemas/types';
import { fyo } from 'src/initFyo';
import { schemaTranslateables } from 'utils/translationHelpers';
import { getDocuments } from './api';
import { FrappeDoc } from './document';
import {
  getDocType,
  getFrappeModels,
  isFrappeBacked,
  setDocType,
  type FrappeDocType,
  type FrappeModel,
} from './doctypes';
import { getOpenFrappeDocs } from './documents';
import { clearMeta, getMetaBundle, type DocTypeMeta } from './meta';
import { toSchema, type Placements, type Presentation } from './schema';

/** Loads the meta of every Frappe-backed schema. Screens read it synchronously after this. */
export async function loadFrappeDocTypes() {
  await Promise.all(
    getFrappeModels().map(([name, Model]) => loadDocType(name, Model))
  );
  fyo.doc.observer.on('sync:CustomForm', reloadCustomized);
  fyo.doc.observer.on('delete:CustomForm', reloadCustomized);
}

/** A schema by name: the DocType's for a Frappe-backed schema, else the bridge's. */
export function getSchema(schemaName: string): Schema | undefined {
  return isFrappeBacked(schemaName)
    ? getDocType(schemaName).schema
    : fyo.schemaMap[schemaName];
}

export function getField(
  schemaName: string,
  fieldname: string
): Field | undefined {
  return getSchema(schemaName)?.fields.find(
    (field) => field.fieldname === fieldname
  );
}

/** The fields of a schema by name, leaving out names it does not have. */
export function getFields(schemaName: string, fieldnames: string[]): Field[] {
  return fieldnames
    .map((fieldname) => getField(schemaName, fieldname))
    .filter((field): field is Field => !!field);
}

/** The fields list and global search match besides the name. */
export function getSearchFields(schemaName: string): string[] {
  if (!isFrappeBacked(schemaName)) {
    return fyo.store.searchFields[schemaName] ?? [];
  }

  const { search_fields = '' } = getDocType(schemaName).meta;
  return search_fields
    .split(',')
    .map((fieldname) => fieldname.trim())
    .filter(Boolean);
}

/** The model whose statics (actions, list settings, link filters) present a schema. */
export function getModel(schemaName: string): typeof Doc | undefined {
  return isFrappeBacked(schemaName)
    ? getDocType(schemaName).Model
    : fyo.models[schemaName];
}

async function loadDocType(schemaName: string, Model: FrappeModel) {
  const [bundle, placements] = await Promise.all([
    getMetaBundle(Model.doctype),
    getPlacements(schemaName),
  ]);
  const byName = new Map(bundle.map((meta) => [meta.name, meta]));
  const docType = toDocType(
    byName.get(Model.doctype)!,
    schemaName,
    Model,
    placements
  );
  docType.tables = getTables(docType.meta, byName, Model.presentation.tables);
  setDocType(schemaName, docType);
}

function getTables(
  meta: DocTypeMeta,
  byName: Map<string, DocTypeMeta>,
  presentations: Presentation['tables'] = {}
) {
  const tables: FrappeDocType['tables'] = {};
  for (const field of meta.fields) {
    const child =
      field.fieldtype === 'Table' ? byName.get(field.options!) : undefined;
    if (child) {
      const name = getSchemaNames()[child.name] ?? child.name;
      const fields = presentations[field.fieldname];
      tables[field.fieldname] = toDocType(child, name, FrappeDoc, {}, fields);
    }
  }

  return tables;
}

function toDocType(
  meta: DocTypeMeta,
  schemaName: string,
  Model: FrappeModel,
  placements: Placements,
  tableFields?: Presentation['fields']
): FrappeDocType {
  const presentation: Presentation = meta.istable
    ? { label: meta.name, fields: tableFields }
    : Model.presentation;
  const schema = toSchema(meta, schemaName, presentation, {
    schemaNames: getSchemaNames(),
    roles: window.frappe.boot?.user?.roles ?? [],
    placements,
  });
  const languageMap = TranslationString.prototype.languageMap;
  if (languageMap) {
    translateSchema(
      schema as unknown as Record<string, unknown>,
      languageMap,
      schemaTranslateables
    );
  }

  return { doctype: meta.name, meta, schema, Model, tables: {} };
}

/** Where /books puts each custom field of a schema, as its Books Custom Form says. */
async function getPlacements(schemaName: string): Promise<Placements> {
  const [form] = await getDocuments('Books Custom Form', {
    fields: [{ custom_fields: ['fieldname', 'section', 'tab'] }],
    filters: [['name', '=', schemaName]],
  });
  const rows = (form?.custom_fields ?? []) as Placement[];
  return Object.fromEntries(
    rows.map(({ fieldname, section, tab }) => [
      getCustomFieldname(fieldname),
      { section, tab },
    ])
  );
}

type Placement = { fieldname: string; section?: string; tab?: string };

/** The Custom Field that holds a Books custom field, as `frappe_books.customization` names it. */
function getCustomFieldname(fieldname: string): string {
  return `custom_books_${fieldname.replace(/[ -]/g, '_').toLowerCase()}`;
}

/** Books schema names by doctype, from the boot. */
function getSchemaNames(): Record<string, string | undefined> {
  const doctypes = window.frappe.boot?.books?.doctypes ?? {};
  return Object.fromEntries(
    Object.entries(doctypes).map(([schemaName, doctype]) => [
      doctype,
      schemaName,
    ])
  );
}

/** Shows a customized form's new fields: reloads the doctype that has the customized schema. */
async function reloadCustomized(customized: unknown) {
  for (const [schemaName, Model] of getFrappeModels()) {
    const docType = getDocType(schemaName);
    const tables = Object.values(docType.tables).map(
      (table) => table!.schema.name
    );
    if (customized !== schemaName && !tables.includes(customized as string)) {
      continue;
    }

    clearMeta(Model.doctype);
    await loadDocType(schemaName, Model);
    for (const doc of getOpenFrappeDocs(schemaName)) {
      doc.refreshSchema(schemaName);
    }
  }
}

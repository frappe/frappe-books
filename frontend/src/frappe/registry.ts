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
import {
  getCustomFieldname,
  getTableSchemaName,
  toSchema,
  type Placements,
  type Presentation,
} from './schema';

/** Loads the meta of every Frappe-backed schema. Screens read it synchronously after this. */
export async function loadFrappeDocTypes() {
  await Promise.all(
    getFrappeModels().map(([name, Model]) => loadDocType(name, Model))
  );
  fyo.doc.observer.on('sync:CustomForm', reloadCustomized);
  fyo.doc.observer.on('delete:CustomForm', reloadCustomized);
}

/** A schema by name, as its DocType's meta and model's presentation make it. */
export function getSchema(schemaName: string): Schema | undefined {
  return isFrappeBacked(schemaName) ? getDocType(schemaName).schema : undefined;
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
  const { search_fields = '' } = getDocType(schemaName).meta;
  return search_fields
    .split(',')
    .map((fieldname) => fieldname.trim())
    .filter(Boolean);
}

/** The schema name of every model, in `frappeModels` order. */
export function getAllSchemaNames(): string[] {
  return getFrappeModels().map(([name]) => name);
}

/** The DocType of each model's schema, by schema name, in schema name order. */
export function getSchemaDoctypes(): Record<string, string> {
  const doctypes = getFrappeModels().map(
    ([name, Model]) => [name, Model.doctype] as const
  );
  return Object.fromEntries(doctypes.sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The single schemas, e.g. to load the settings at startup. */
export function getSingleSchemaNames(): string[] {
  return getAllSchemaNames().filter((name) => getSchema(name)?.isSingle);
}

/** The schema that shows `name`: a schema name, or a DocType that a Frappe-backed document holds. */
export function toSchemaName(name: string): string | undefined {
  if (getSchema(name)) {
    return name;
  }

  const schemaName = getSchemaNames()[name] ?? getTableSchemaName(name);
  return getSchema(schemaName) ? schemaName : undefined;
}

/** The label /books shows for a doctype: its schema's, e.g. `Sales Invoice` for `Books Sales Invoice`. */
export function getDoctypeLabel(doctype: string): string {
  const schemaName = toSchemaName(doctype);
  return (schemaName && getSchema(schemaName)?.label) || doctype;
}

/** The model whose statics (actions, list settings, link filters) present a schema. */
export function getModel(schemaName: string): typeof Doc | undefined {
  return isFrappeBacked(schemaName) ? getDocType(schemaName).Model : undefined;
}

async function loadDocType(schemaName: string, Model: FrappeModel) {
  const [bundle, placements] = await Promise.all([
    getMetaBundle(Model.doctype),
    getPlacements(Model.doctype),
  ]);
  const byName = new Map(bundle.map((meta) => [meta.name, meta]));
  const docType = toDocType(
    byName.get(Model.doctype)!,
    schemaName,
    Model,
    placements
  );
  docType.tables = getTables(docType.meta, byName, Model);
  setDocType(schemaName, docType);
}

function getTables(
  meta: DocTypeMeta,
  byName: Map<string, DocTypeMeta>,
  Model: FrappeModel
) {
  const tables: FrappeDocType['tables'] = {};
  for (const field of meta.fields) {
    const child =
      field.fieldtype === 'Table' ? byName.get(field.options!) : undefined;
    if (child) {
      const name = getTableSchemaName(child.name);
      const RowModel = Model.rowModels[field.fieldname] ?? FrappeDoc;
      tables[field.fieldname] = toDocType(child, name, RowModel, {});
    }
  }

  return tables;
}

function toDocType(
  meta: DocTypeMeta,
  schemaName: string,
  Model: FrappeModel,
  placements: Placements
): FrappeDocType {
  // Rows without a model of their own are labelled by their doctype.
  const presentation: Presentation = {
    ...Model.presentation,
    label: Model.presentation.label || meta.name,
  };
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

/** Where /books puts each custom field of a doctype, as its Books Custom Form says. */
async function getPlacements(doctype: string): Promise<Placements> {
  const [form] = await getDocuments('Books Custom Form', {
    fields: [{ custom_fields: ['fieldname', 'section', 'tab'] }],
    filters: [['name', '=', doctype]],
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

/** Schema names by doctype: each model's. */
function getSchemaNames(): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(getSchemaDoctypes()).map(([name, doctype]) => [
      doctype,
      name,
    ])
  );
}

/** Shows a customized form's new fields: reloads the doctypes that show or hold the customized doctype. */
async function reloadCustomized(customized: unknown) {
  for (const [schemaName, Model] of getFrappeModels()) {
    const docType = getDocType(schemaName);
    const doctypes = [docType, ...Object.values(docType.tables)].map(
      (shown) => shown!.doctype
    );
    if (!doctypes.includes(customized as string)) {
      continue;
    }

    clearMeta(Model.doctype);
    await loadDocType(schemaName, Model);
    // A customized table refreshes the rows of the open documents that hold it.
    const customizedSchema = toSchemaName(customized as string)!;
    for (const doc of getOpenFrappeDocs(schemaName)) {
      doc.refreshSchema(customizedSchema);
    }
  }
}

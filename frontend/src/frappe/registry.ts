import { translateSchema, TranslationString } from 'fyo/utils/translation';
import type { Field, Schema } from 'schemas/types';
import { fyo } from 'src/initFyo';
import { schemaTranslateables } from 'utils/translationHelpers';
import { FrappeDoc } from './document';
import {
  getDocType,
  getFrappeModels,
  getModelDoctype,
  isFrappeBacked,
  setDocType,
  type FrappeDocType,
  type FrappeModel,
} from './doctypes';
import { isTableDocField } from './fieldProperties';
import { getOpenFrappeDocs } from './documents';
import { setAppTitles, type AccessoryLayout } from './accessoryLayout';
import { isAccessoryMode } from './mode';
import { getBooksMeta, type BooksMeta, type DocTypeMeta } from './meta';
import {
  getNamingField,
  getTableSchemaName,
  toSchema,
  type Placements,
  type Presentation,
} from './schema';

const QUICK_VIEW_SKIPPED_FIELDTYPES = ['Table', 'AttachImage', 'Attachment'];

/** Loads the meta of every model's schema in one request. Screens read it synchronously after this. */
export async function loadFrappeDocTypes() {
  const models = getFrappeModels();
  setDocTypes(models, await getModelsMeta(models));

  fyo.observer.on('sync:CustomForm', reloadCustomized);
  fyo.observer.on('delete:CustomForm', reloadCustomized);
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

/**
 * The fields of export and import files: the schema's `fileFields` in their
 * order, then its custom and meta fields; else all its stored fields.
 */
export function getFileFields(schemaName: string): Field[] {
  const schema = getSchema(schemaName)!;
  // Insert-only and client values are not the DocType's, so files cannot hold them.
  const fields = schema.fields.filter(
    (field) => !field.insertOnly && !field.clientOnly
  );
  const { fileFields } = schema;
  if (!fileFields) {
    return fields;
  }

  const listed = getFields(schemaName, fileFields);
  const rest = fields.filter(
    (field) => (field.isCustom || field.meta) && !listed.includes(field)
  );
  return [...listed, ...rest];
}

/**
 * The fields a quick view of a document lists, in file order. The quick view
 * heads with the name, so the naming field is left out.
 */
export function getQuickViewFields(schemaName: string): Field[] {
  const names = ['name', getNamingField(getDocType(schemaName).meta)];
  return getFileFields(schemaName).filter(
    (field) =>
      !QUICK_VIEW_SKIPPED_FIELDTYPES.includes(field.fieldtype) &&
      !names.includes(field.fieldname) &&
      !field.hidden &&
      !field.meta
  );
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
    ([name, Model]) => [name, getModelDoctype(Model)] as const
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
export function getModel(schemaName: string): typeof FrappeDoc | undefined {
  return isFrappeBacked(schemaName) ? getDocType(schemaName).Model : undefined;
}

/** The meta of the models' doctypes; in accessory mode with the Books twins that lay them out. */
async function getModelsMeta(models: [string, FrappeModel][]) {
  const doctypes = models.map(([, Model]) => getModelDoctype(Model));
  const layouts = models
    .map(([, Model]) => getLayoutDoctype(Model))
    .filter((doctype): doctype is string => !!doctype);
  return await getBooksMeta(doctypes, layouts.length ? layouts : undefined);
}

/** The Books twin whose positions lay out the ERPNext doctype a model shows in accessory mode. */
function getLayoutDoctype(Model: FrappeModel): string | undefined {
  const doctype = getModelDoctype(Model);
  return isAccessoryMode() && doctype !== Model.doctype
    ? Model.doctype
    : undefined;
}

/** Stores each model's doctype and tables, as their meta and the custom field placements make them. */
function setDocTypes(models: [string, FrappeModel][], booksMeta: BooksMeta) {
  const byName = new Map(booksMeta.metas.map((meta) => [meta.name, meta]));
  const { placements } = booksMeta;
  setAppTitles(booksMeta.accessory?.app_titles ?? []);
  for (const [schemaName, Model] of models) {
    const meta = byName.get(getModelDoctype(Model))!;
    const layoutMeta = byName.get(getLayoutDoctype(Model) ?? '');
    const layout = layoutMeta && getLayout(meta, layoutMeta, '', booksMeta);
    const docType = toDocType(
      meta,
      schemaName,
      Model,
      placements[meta.name],
      layout
    );
    docType.tables = getTables(meta, byName, Model, booksMeta, layoutMeta);
    setDocType(schemaName, docType);
  }
}

function getTables(
  meta: DocTypeMeta,
  byName: Map<string, DocTypeMeta>,
  Model: FrappeModel,
  booksMeta: BooksMeta,
  layoutMeta?: DocTypeMeta
) {
  const tables: FrappeDocType['tables'] = {};
  for (const field of meta.fields) {
    const child = isTableDocField(field)
      ? byName.get(field.options!)
      : undefined;
    if (child) {
      const name = getTableSchemaName(child.name);
      const RowModel = Model.rowModels[field.fieldname] ?? FrappeDoc;
      const childLayout = getChildLayoutMeta(
        field.fieldname,
        byName,
        layoutMeta
      );
      // Rows take their parent's permissions, as in Frappe.
      tables[field.fieldname] = toDocType(
        { ...child, permissions: meta.permissions },
        name,
        RowModel,
        booksMeta.placements[child.name],
        childLayout &&
          getLayout(child, childLayout, field.fieldname, booksMeta, meta.name)
      );
    }
  }

  return tables;
}

/** The Books rows that lay out an ERPNext table: those of the Books table of the same fieldname. */
function getChildLayoutMeta(
  fieldname: string,
  byName: Map<string, DocTypeMeta>,
  layoutMeta?: DocTypeMeta
): DocTypeMeta | undefined {
  const table = layoutMeta?.fields.find((f) => f.fieldname === fieldname);
  return table && isTableDocField(table)
    ? byName.get(table.options!)
    : undefined;
}

/** How accessory mode lays out an ERPNext doctype, or a table's rows of the form doctype `form`. */
function getLayout(
  meta: DocTypeMeta,
  layoutMeta: DocTypeMeta,
  tableFieldname: string,
  { accessory }: BooksMeta,
  form = meta.name
): AccessoryLayout {
  return {
    meta: layoutMeta,
    tabs: accessory?.tabs[meta.name] ?? {},
    picks: accessory?.picks[form]?.[tableFieldname] ?? [],
  };
}

function toDocType(
  meta: DocTypeMeta,
  schemaName: string,
  Model: FrappeModel,
  placements: Placements = {},
  layout?: AccessoryLayout
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
    layout,
  });
  const languageMap = TranslationString.prototype.languageMap;
  if (languageMap) {
    translateSchema(
      schema as unknown as Record<string, unknown>,
      languageMap,
      schemaTranslateables
    );
  }

  return { doctype: meta.name, meta, schema, Model, tables: {}, placements };
}

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

    setDocTypes(
      [[schemaName, Model]],
      await getModelsMeta([[schemaName, Model]])
    );
    // A customized table refreshes the rows of the open documents that hold it.
    const customizedSchema = toSchemaName(customized as string)!;
    for (const doc of getOpenFrappeDocs(schemaName)) {
      doc.refreshSchema(customizedSchema);
    }
  }
}

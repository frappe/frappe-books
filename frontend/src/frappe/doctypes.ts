import type { Schema } from 'schemas/types';
import type { FrappeDoc } from './document';
import type { DocTypeMeta } from './meta';
import type { Placements } from './schema';

export type FrappeModel = typeof FrappeDoc;

/** A Frappe DocType as /books shows it, and the doctypes of its tables by fieldname. */
export interface FrappeDocType {
  doctype: string;
  meta: DocTypeMeta;
  schema: Schema;
  Model: FrappeModel;
  tables: Record<string, FrappeDocType | undefined>;
  placements: Placements;
}

const models = new Map<string, FrappeModel>();
const docTypes = new Map<string, FrappeDocType>();

/** Registers the model of each schema; a regional model replaces the one of its schema. */
export function registerFrappeModels(map: Record<string, FrappeModel>) {
  for (const [schemaName, Model] of Object.entries(map)) {
    models.set(schemaName, Model);
  }
}

/** Whether the schema is known: a model's, or the rows of a table it holds. */
export function isFrappeBacked(schemaName: string | undefined): boolean {
  return !!schemaName && (models.has(schemaName) || docTypes.has(schemaName));
}

export function getFrappeModels(): [string, FrappeModel][] {
  return [...models.entries()];
}

export function getDocType(schemaName: string): FrappeDocType {
  const docType = docTypes.get(schemaName);
  if (!docType) {
    throw new Error(`The Frappe meta of ${schemaName} is not loaded`);
  }

  return docType;
}

/** Every loaded doctype, by schema, the tables included. */
export function getDocTypes(): FrappeDocType[] {
  return [...docTypes.values()];
}

/** Stores a loaded doctype under its schema name, and its tables under theirs. */
export function setDocType(schemaName: string, docType: FrappeDocType) {
  docTypes.set(schemaName, docType);
  for (const table of Object.values(docType.tables)) {
    docTypes.set(table!.schema.name, table!);
  }
}

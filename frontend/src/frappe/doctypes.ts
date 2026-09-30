import type { Schema } from 'schemas/types';
import type { FrappeDoc } from './document';
import type { DocTypeMeta } from './meta';

export type FrappeModel = typeof FrappeDoc;

/** A Frappe DocType as /books shows it, and the doctypes of its tables by fieldname. */
export interface FrappeDocType {
  doctype: string;
  meta: DocTypeMeta;
  schema: Schema;
  Model: FrappeModel;
  tables: Record<string, FrappeDocType | undefined>;
}

const models = new Map<string, FrappeModel>();
const docTypes = new Map<string, FrappeDocType>();

/**
 * The transition switch: a schema whose model is registered here is served
 * by Frappe directly (Frappe fieldnames, /api/v2). Every other schema still
 * goes through the camelCase bridge (`fyo.db`).
 */
export function registerFrappeModels(map: Record<string, FrappeModel>) {
  for (const [schemaName, Model] of Object.entries(map)) {
    models.set(schemaName, Model);
  }
}

/** Whether Frappe serves the schema's documents, including the rows of its tables. */
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

/** Stores a loaded doctype under its schema name, and its tables under theirs. */
export function setDocType(schemaName: string, docType: FrappeDocType) {
  docTypes.set(schemaName, docType);
  for (const table of Object.values(docType.tables)) {
    docTypes.set(table!.schema.name, table!);
  }
}

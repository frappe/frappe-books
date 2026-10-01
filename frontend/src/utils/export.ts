import { t } from 'fyo/utils/translation';
import { Field, FieldType, FieldTypeEnum, TargetField } from 'schemas/types';
import { getDocuments, type DocValues, type ListQuery } from 'src/frappe/api';
import { getDocType } from 'src/frappe/doctypes';
import { getOrderBy, toFrappeFilters } from 'src/frappe/list';
import { getFileFields, getSchema } from 'src/frappe/registry';
import { getNamingField } from 'src/frappe/schema';
import { generateCSV } from 'utils/csvParser';
import { QueryFilter } from 'utils/db/types';
import { expandDocStatus } from './filterFields';
import { ExportField, ExportTableField } from './types';

const EXPORT_PAGE_SIZE = 500;

const excludedFieldTypes: FieldType[] = [
  FieldTypeEnum.AttachImage,
  FieldTypeEnum.Attachment,
];

// Books' Submitted and Cancelled, by the docstatus values that set them.
const DOCSTATUS_FLAGS: Record<string, number[]> = {
  submitted: [1, 2],
  cancelled: [2],
};

/** What an export reads: a page at a time, newest first. */
interface ExportQuery {
  schemaName: string;
  fields: ExportField[];
  tableFields: ExportTableField[];
  limit: number | null;
  filters: QueryFilter;
}

/**
 * The fields an export offers, as Books listed them: the document's own,
 * its audit fields, a tree's nested set, then its custom fields.
 */
export function getExportFields(schemaName: string): ExportField[] {
  const fields = getFileFields(schemaName);
  const own = fields.filter((field) => !field.meta && !field.isCustom);
  const custom = fields.filter((field) => field.isCustom);
  if (getSchema(schemaName)!.isChild) {
    return toExportFields([...own, ...custom]);
  }

  const audit = fields
    .filter((field) => field.meta && field.fieldname !== 'name')
    .flatMap(expandDocStatus);
  return toExportFields([
    ...getNameField(schemaName, fields),
    ...own,
    ...audit,
    ...getTreeFields(schemaName),
    ...custom,
  ]);
}

/** The tables an export offers, in the order of its fields. */
export function getExportTableFields(schemaName: string): ExportTableField[] {
  return getFileFields(schemaName)
    .filter((f): f is TargetField => f.fieldtype === FieldTypeEnum.Table)
    .map(({ fieldname, label, target }) => ({
      fieldname,
      label,
      target,
      fields: getExportFields(target),
    }))
    .filter((f) => !!f.fields.length);
}

/** The documents as a JSON list; each table's rows are a list in its document. */
export async function getJsonExportData(query: ExportQuery): Promise<string> {
  const documents = await getExportRows(query);
  const columns = getColumns(query.schemaName, query.fields);
  const tables = getTableColumns(query);
  return JSON.stringify(
    documents.map((document) => toJsonDocument(document, columns, tables))
  );
}

/**
 * The documents as CSV: a row of labels, a row of `schema.fieldname` keys,
 * then a row for each table row, which repeats its document's values.
 */
export async function getCsvExportData(query: ExportQuery): Promise<string> {
  const documents = await getExportRows(query);
  const columns = getColumns(query.schemaName, query.fields);
  const tables = getTableColumns(query);
  const flatColumns = [columns, ...tables.map((table) => table.columns)].flat();
  const labels = flatColumns.map((column) => column.label);
  const keys = flatColumns.map((column) => column.csvKey);
  const rows = documents.flatMap((document) =>
    getCsvRows(document, columns, tables)
  );
  return generateCSV([labels, keys, ...rows]);
}

/** A picked field as a file holds it: its label, keys and value. */
interface ExportColumn {
  label: string;
  /** The key of the value in a JSON document. */
  key: string;
  /** The key of the column in CSV, `schema.key`. */
  csvKey: string;
  getValue: (values: DocValues) => unknown;
}

interface TableColumns {
  fieldname: string;
  key: string;
  columns: ExportColumn[];
}

function toJsonDocument(
  document: DocValues,
  columns: ExportColumn[],
  tables: TableColumns[]
): DocValues {
  const values = toJsonValues(document, columns);
  for (const { fieldname, key, columns } of tables) {
    const rows = (document[fieldname] as DocValues[] | undefined) ?? [];
    values[key] = rows.map((row) => toJsonValues(row, columns));
  }

  return values;
}

function toJsonValues(values: DocValues, columns: ExportColumn[]): DocValues {
  return Object.fromEntries(
    columns.map(({ key, getValue }) => [key, getValue(values)])
  );
}

function getCsvRows(
  document: DocValues,
  columns: ExportColumn[],
  tables: TableColumns[]
): unknown[][] {
  const getCell = (values: DocValues, column: ExportColumn) =>
    column.getValue(values) ?? '';
  const parentCells = columns.map((column) => getCell(document, column));
  const tableColumns = tables.flatMap((table) => table.columns);
  const childCells = tables.flatMap(({ fieldname, columns }) =>
    ((document[fieldname] as DocValues[] | undefined) ?? []).map((row) =>
      tableColumns.map((column) =>
        columns.includes(column) ? getCell(row, column) : ''
      )
    )
  );
  if (!childCells.length) {
    return [[...parentCells, ...tableColumns.map(() => '')]];
  }

  return childCells.map((cells) => [...parentCells, ...cells]);
}

/** The columns of the picked tables. */
function getTableColumns({ fields, tableFields }: ExportQuery): TableColumns[] {
  return getExportedTables(fields, tableFields).map((tf) => ({
    fieldname: tf.fieldname,
    key: tf.fieldname,
    columns: getColumns(tf.target, tf.fields),
  }));
}

/** The picked fields that hold values, as columns. */
function getColumns(schemaName: string, fields: ExportField[]): ExportColumn[] {
  return getPickedFields(fields).map(({ fieldname, label }) => ({
    label,
    key: fieldname,
    csvKey: `${schemaName}.${fieldname}`,
    getValue: (values: DocValues) => getExportValue(values, fieldname),
  }));
}

/** A field's value; Submitted and Cancelled follow the docstatus. */
function getExportValue(values: DocValues, fieldname: string): unknown {
  const flag = DOCSTATUS_FLAGS[fieldname];
  return flag ? flag.includes(values.docstatus as number) : values[fieldname];
}

/** The tables whose field is picked for export. */
function getExportedTables(
  fields: ExportField[],
  tableFields: ExportTableField[]
): ExportTableField[] {
  return tableFields.filter(
    (tf) => fields.find((f) => f.fieldname === tf.fieldname)?.export
  );
}

/** The picked fields that hold values, leaving out tables. */
function getPickedFields(fields: ExportField[]): ExportField[] {
  return fields.filter((f) => f.export && f.fieldtype !== FieldTypeEnum.Table);
}

/** The documents, each with the rows of its picked tables, a page at a time. */
async function getExportRows(query: ExportQuery): Promise<DocValues[]> {
  const rows: DocValues[] = [];
  const { limit } = query;
  while (!limit || rows.length < limit) {
    const pageSize = Math.min(
      EXPORT_PAGE_SIZE,
      (limit || Infinity) - rows.length
    );
    const page = { start: rows.length, limit: pageSize };
    const pageRows = await getFrappeRows(query, page);
    rows.push(...pageRows);
    if (pageRows.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function getFrappeRows(
  { schemaName, fields, tableFields, filters }: ExportQuery,
  page: { start: number; limit: number }
): Promise<DocValues[]> {
  const docType = getDocType(schemaName);
  const tables = getExportedTables(fields, tableFields).map((tf) => ({
    [tf.fieldname]: getStoredFieldnames(tf.target, tf.fields),
  }));
  const queryFields: ListQuery['fields'] = [
    'name',
    ...getStoredFieldnames(schemaName, fields).filter((f) => f !== 'name'),
    ...tables,
  ];
  return await getDocuments(docType.doctype, {
    fields: queryFields,
    filters: toFrappeFilters(filters),
    orderBy: getOrderBy(docType),
    ...page,
  });
}

/**
 * The columns the picked fields read: Submitted and Cancelled read the
 * docstatus, and virtual fields have no stored value to read.
 */
function getStoredFieldnames(
  schemaName: string,
  fields: ExportField[]
): string[] {
  const virtual = getDocType(schemaName)
    .meta.fields.filter((field) => field.is_virtual)
    .map(({ fieldname }) => fieldname);
  const fieldnames = getPickedFields(fields).map(({ fieldname }) =>
    DOCSTATUS_FLAGS[fieldname] ? 'docstatus' : fieldname
  );
  return [...new Set(fieldnames)].filter((f) => !virtual.includes(f));
}

function toExportFields(fields: Field[]): ExportField[] {
  return fields
    .filter((f) => !f.computed && f.label)
    .map(({ fieldname, label, fieldtype }) => ({
      fieldname,
      fieldtype,
      label,
      export: !excludedFieldTypes.includes(fieldtype),
    }));
}

/**
 * A numbered document's name, which leads; a document named by a field
 * exports that field as its name, and a prompted name is an own field.
 */
function getNameField(schemaName: string, fields: Field[]): Field[] {
  const name = fields.find((f) => f.meta && f.fieldname === 'name');
  const namingField = getNamingField(getDocType(schemaName).meta);
  return name && !namingField ? [name] : [];
}

/** Books exported a tree's nested set, which /books otherwise leaves to the server. */
function getTreeFields(schemaName: string): Field[] {
  if (!getSchema(schemaName)!.isTree) {
    return [];
  }

  return [
    { fieldname: 'lft', label: t`Left Index`, fieldtype: 'Int' },
    { fieldname: 'rgt', label: t`Right Index`, fieldtype: 'Int' },
  ] as Field[];
}

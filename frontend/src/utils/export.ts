import { Fyo } from 'fyo';
import {
  Field,
  FieldType,
  FieldTypeEnum,
  RawValue,
  TargetField,
} from 'schemas/types';
import { getDocuments, type DocValues, type ListQuery } from 'src/frappe/api';
import { getDocType, isFrappeBacked } from 'src/frappe/doctypes';
import { getOrderBy, toFrappeFilters } from 'src/frappe/list';
import { getSchema } from 'src/frappe/registry';
import { generateCSV } from 'utils/csvParser';
import { GetAllOptions, QueryFilter } from 'utils/db/types';
import { getMapFromList, safeParseFloat } from 'utils/index';
import { ExportField, ExportTableField } from './types';

const EXPORT_PAGE_SIZE = 500;

const excludedFieldTypes: FieldType[] = [
  FieldTypeEnum.AttachImage,
  FieldTypeEnum.Attachment,
];

interface CsvHeader {
  label: string;
  schemaName: string;
  fieldname: string;
  parentFieldname?: string;
}

/** What an export reads: a page at a time, newest first. */
interface ExportQuery {
  schemaName: string;
  fields: ExportField[];
  tableFields: ExportTableField[];
  limit: number | null;
  filters: QueryFilter;
}

export function getExportFields(
  fields: Field[],
  exclude: string[] = []
): ExportField[] {
  return fields
    .filter((f) => !f.computed && f.label && !exclude.includes(f.fieldname))
    .map((field) => {
      const { fieldname, label } = field;
      const fieldtype = field.fieldtype as FieldType;
      return {
        fieldname,
        fieldtype,
        label,
        export: !excludedFieldTypes.includes(fieldtype),
      };
    });
}

export function getExportTableFields(fields: Field[]): ExportTableField[] {
  return fields
    .filter((f) => f.fieldtype === FieldTypeEnum.Table)
    .map((f) => {
      const target = (f as TargetField).target;
      const tableFields = getSchema(target)?.fields ?? [];
      const exportTableFields = getExportFields(tableFields, ['name']);

      return {
        fieldname: f.fieldname,
        label: f.label,
        target,
        fields: exportTableFields,
      };
    })
    .filter((f) => !!f.fields.length);
}

/** The documents as a JSON list; each table's rows are a list in its document. */
export async function getJsonExportData(
  query: ExportQuery,
  fyo: Fyo
): Promise<string> {
  return JSON.stringify(await getExportRows(query, fyo));
}

/**
 * The documents as CSV: a row of labels, a row of `schema.fieldname` keys,
 * then a row for each table row, which repeats its document's values.
 */
export async function getCsvExportData(
  query: ExportQuery,
  fyo: Fyo
): Promise<string> {
  const documents = await getExportRows(query, fyo);
  const headers = getCsvHeaders(query);
  const rows = documents.flatMap((document) => getCsvRows(document, headers));
  const flatHeaders = [headers.parent, headers.child].flat();
  const labels = flatHeaders.map((f) => f.label);
  const keys = flatHeaders.map((f) => `${f.schemaName}.${f.fieldname}`);
  return generateCSV([labels, keys, ...rows]);
}

function getCsvRows(
  document: DocValues,
  headers: ReturnType<typeof getCsvHeaders>
): RawValue[][] {
  const getCell = (values: DocValues, fieldname: string) =>
    (values[fieldname] as RawValue) ?? '';
  const parentCells = headers.parent.map((f) => getCell(document, f.fieldname));
  const childCells = headers.tables.flatMap((tableFieldname) =>
    ((document[tableFieldname] as DocValues[] | undefined) ?? []).map((row) =>
      headers.child.map((f) =>
        f.parentFieldname === tableFieldname ? getCell(row, f.fieldname) : ''
      )
    )
  );
  if (!childCells.length) {
    return [[...parentCells, ...headers.child.map(() => '')]];
  }

  return childCells.map((cells) => [...parentCells, ...cells]);
}

function getCsvHeaders({ schemaName, fields, tableFields }: ExportQuery) {
  const headers = {
    parent: [] as CsvHeader[],
    child: [] as CsvHeader[],
    tables: [] as string[],
  };
  for (const { label, fieldname, fieldtype, export: shouldExport } of fields) {
    if (!shouldExport || fieldtype === FieldTypeEnum.Table) {
      continue;
    }

    headers.parent.push({ schemaName, label, fieldname });
  }

  for (const tf of getExportedTables(fields, tableFields)) {
    headers.tables.push(tf.fieldname);
    for (const field of tf.fields) {
      if (!field.export) {
        continue;
      }

      headers.child.push({
        schemaName: tf.target,
        label: field.label,
        fieldname: field.fieldname,
        parentFieldname: tf.fieldname,
      });
    }
  }

  return headers;
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
function getExportedFieldnames(fields: ExportField[]): string[] {
  return fields
    .filter((f) => f.export && f.fieldtype !== FieldTypeEnum.Table)
    .map((f) => f.fieldname);
}

/** The documents, each with the rows of its picked tables, a page at a time. */
async function getExportRows(
  query: ExportQuery,
  fyo: Fyo
): Promise<DocValues[]> {
  const rows: DocValues[] = [];
  const { limit } = query;
  while (!limit || rows.length < limit) {
    const pageSize = Math.min(
      EXPORT_PAGE_SIZE,
      (limit || Infinity) - rows.length
    );
    const page = { start: rows.length, limit: pageSize };
    const pageRows = isFrappeBacked(query.schemaName)
      ? await getFrappeRows(query, page)
      : await getBridgeRows(query, page, fyo);
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

/** Picked fields with a column; virtual fields have no stored value to read. */
function getStoredFieldnames(
  schemaName: string,
  fields: ExportField[]
): string[] {
  const virtual = getDocType(schemaName)
    .meta.fields.filter((field) => field.is_virtual)
    .map(({ fieldname }) => fieldname);
  return getExportedFieldnames(fields).filter((f) => !virtual.includes(f));
}

/** The documents of a schema still on the bridge, nested as Frappe sends them. */
async function getBridgeRows(
  { schemaName, fields, tableFields, filters }: ExportQuery,
  page: { start: number; limit: number },
  fyo: Fyo
): Promise<DocValues[]> {
  const orderBy = ['created'];
  if (fyo.db.fieldMap[schemaName]['date']) {
    orderBy.unshift('date');
  }

  const options: GetAllOptions = {
    filters,
    orderBy,
    order: 'desc',
    offset: page.start,
    limit: page.limit,
    fields: [...new Set(['name', ...getExportedFieldnames(fields)])],
  };
  const parents = await fyo.db.getAllRaw(schemaName, options);
  convertRawPesaToFloat(parents, fields);
  if (parents.length) {
    for (const tf of getExportedTables(fields, tableFields)) {
      await addBridgeTableRows(parents, tf, fyo);
    }
  }

  return parents;
}

async function addBridgeTableRows(
  parents: DocValues[],
  { fieldname, target, fields }: ExportTableField,
  fyo: Fyo
) {
  const nameMap = getMapFromList(parents, 'name');
  const rows = await fyo.db.getAllRaw(target, {
    orderBy: 'idx',
    fields: ['parent', ...getExportedFieldnames(fields)],
    filters: { parent: ['in', Object.keys(nameMap)] },
  });
  convertRawPesaToFloat(rows, fields);
  for (const { parent, ...row } of rows) {
    delete row.name;
    const document = nameMap[parent as string];
    document[fieldname] ??= [];
    (document[fieldname] as DocValues[]).push(row);
  }
}

function convertRawPesaToFloat(data: DocValues[], fields: ExportField[]) {
  const currencyFields = fields.filter(
    (f) => f.fieldtype === FieldTypeEnum.Currency
  );

  for (const row of data) {
    for (const { fieldname } of currencyFields) {
      row[fieldname] = safeParseFloat((row[fieldname] ?? '0') as string);
    }
  }
}

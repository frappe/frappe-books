import { Fyo } from 'fyo';
import { Converter } from 'fyo/core/converter';
import { DocValue } from 'fyo/core/types';
import { getEmptyValuesByFieldTypes, isPesa } from 'fyo/utils';
import { ValidationError } from 'fyo/utils/errors';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import {
  Field,
  FieldType,
  FieldTypeEnum,
  OptionField,
  RawValue,
  Schema,
  TargetField,
} from 'schemas/types';
import { generateCSV, parseCSV } from 'utils/csvParser';
import { getValueMapFromList } from 'utils/index';

export type TemplateField = Field & TemplateFieldProps;

/** The schemas the Import Wizard offers that the user may import. */
export function getImportableSchemaNames(fyo: Fyo): ModelNameEnum[] {
  const importables = [
    ModelNameEnum.SalesInvoice,
    ModelNameEnum.PurchaseInvoice,
    ModelNameEnum.Payment,
    ModelNameEnum.Party,
    ModelNameEnum.Item,
    ModelNameEnum.JournalEntry,
    ModelNameEnum.Tax,
    ModelNameEnum.Account,
    ModelNameEnum.Address,
    ModelNameEnum.NumberSeries,
  ];

  if (fyo.singles.AccountingSettings?.enable_inventory) {
    importables.push(
      ModelNameEnum.StockMovement,
      ModelNameEnum.Shipment,
      ModelNameEnum.PurchaseReceipt,
      ModelNameEnum.Location
    );
  }

  return importables.filter((schemaName) => fyo.can(schemaName, 'import'));
}

/** A CSV that Frappe's Data Import reads, and the grid row of each of its data rows. */
export interface ImportFile {
  csv: string;
  gridRows: number[];
}

/** The grid rows behind file rows Frappe names, counting the header as row 1. */
export function getGridRows(file: ImportFile, fileRows: number[]): number[] {
  return fileRows.map((row) => file.gridRows[row - 2]);
}

type TemplateFieldProps = {
  schemaName: string;
  schemaLabel: string;
  fieldKey: string;
  parentSchemaChildField?: TargetField;
};

type ValueMatrixItem =
  | {
      value: DocValue;
      rawValue?: RawValue;
      error?: boolean;
    }
  | { value?: DocValue; rawValue: RawValue; error?: boolean };

type ValueMatrix = ValueMatrixItem[][];

type ImportColumn = { index: number; field: TemplateField; key: string };

const skippedFieldsTypes: FieldType[] = [
  FieldTypeEnum.AttachImage,
  FieldTypeEnum.Attachment,
  FieldTypeEnum.Table,
];

/**
 * Grid of the Import Wizard
 * - Takes in unstructured CSV data and maps its columns to template fields
 * - Writes the grid as a file for Frappe's Data Import, which saves the documents
 */
export class Importer {
  schemaName: string;
  fyo: Fyo;

  /**
   * List of template fields that have been assigned a column, in
   * the order they have been assigned.
   */
  assignedTemplateFields: (string | null)[];

  /**
   * Map of all the template fields that can be imported.
   */
  templateFieldsMap: Map<string, TemplateField>;

  /**
   * Maps user-facing CSV headers to their template field keys.
   */
  templateFieldKeysByHeader: Map<string, string>;

  /**
   * Maps template field keys to the headers used in generated CSV files.
   */
  templateHeadersByFieldKey: Map<string, string>;

  /**
   * Map of Fields that have been picked, i.e.
   * - Fields which will be included in the template
   * - Fields for which values will be provided
   */
  templateFieldsPicked: Map<string, boolean>;

  /**
   * Matrix containing the raw values which will be converted to
   * doc values before importing.
   */
  valueMatrix: ValueMatrix;

  /**
   * Used if an options field is imported where the import data
   * provided maybe the label and not the value
   */
  optionsMap: {
    values: Record<string, Set<string>>;
    labelValueMap: Record<string, Record<string, string>>;
  };

  constructor(schemaName: string, fyo: Fyo) {
    if (!fyo.schemaMap[schemaName]) {
      throw new ValidationError(
        `Invalid schemaName ${schemaName} found in importer`
      );
    }

    this.schemaName = schemaName;
    this.fyo = fyo;
    this.valueMatrix = [];
    this.optionsMap = {
      values: {},
      labelValueMap: {},
    };

    const templateFields = getTemplateFields(schemaName, fyo);
    this.assignedTemplateFields = templateFields.map((f) => f.fieldKey);
    this.templateFieldsMap = new Map();
    this.templateFieldsPicked = new Map();

    templateFields.forEach((f) => {
      this.templateFieldsMap.set(f.fieldKey, f);
      this.templateFieldsPicked.set(f.fieldKey, true);
    });

    const { fieldKeysByHeader, headersByFieldKey } =
      getTemplateHeaderMaps(templateFields);
    this.templateFieldKeysByHeader = fieldKeysByHeader;
    this.templateHeadersByFieldKey = headersByFieldKey;
  }

  selectFile(data: string) {
    this.selectParsed(parseCSV(data));
  }

  /** Labels of the template fields assigned to more than one column. */
  getDuplicateColumns(): string[] {
    const assigned = new Set<string>();
    const duplicates = new Set<string>();
    for (const key of this.assignedTemplateFields) {
      const tf = this.templateFieldsMap.get(key ?? '');
      if (!key || !tf) {
        continue;
      }

      if (assigned.has(key)) {
        duplicates.add(getColumnLabel(tf));
      }

      assigned.add(key);
    }

    return [...duplicates];
  }

  /** Labels of the required template fields no column is assigned to. */
  getMissingRequiredColumns(): string[] {
    const assigned = new Set(this.assignedTemplateFields);
    return [...this.templateFieldsMap.values()]
      .filter((tf) => tf.required && !assigned.has(tf.fieldKey))
      .map(getColumnLabel);
  }

  /** Includes or leaves out a template field; leaving one out frees its column. */
  pickColumn(fieldKey: string, picked: boolean) {
    this.templateFieldsPicked.set(fieldKey, picked);
    const index = this.assignedTemplateFields.indexOf(fieldKey);
    if (picked || index < 0) {
      return;
    }

    this.assignedTemplateFields[index] = null;
    this.reassignTemplateFields();
  }

  /** Assigns the picked fields to the columns in order, until data is loaded. */
  reassignTemplateFields() {
    if (this.valueMatrix.length) {
      return;
    }

    const picked = [...this.templateFieldsPicked]
      .filter(([, isPicked]) => isPicked)
      .map(([key]) => key);
    this.assignedTemplateFields = this.assignedTemplateFields.map(
      (_, index) => picked[index] ?? null
    );
  }

  /** Keeps only the rows at `indexes`, to import them again. */
  keepRows(indexes: number[]) {
    this.valueMatrix = this.valueMatrix.filter((_, index) =>
      indexes.includes(index)
    );
  }

  checkCellErrors() {
    const assigned = this.assignedTemplateFields
      .map((key, index) => ({
        key,
        index,
        tf: this.templateFieldsMap.get(key ?? ''),
      }))
      .filter(({ key, tf }) => !!key && !!tf) as {
      key: string;
      index: number;
      tf: TemplateField;
    }[];

    const cellErrors = [];
    for (let i = 0; i < this.valueMatrix.length; i++) {
      const row = this.valueMatrix[i];
      for (const { tf, index } of assigned) {
        if (!row[index]?.error) {
          continue;
        }

        const rowLabel = this.fyo.t`Row ${i + 1}`;
        const columnLabel = getColumnLabel(tf);
        cellErrors.push(`(${rowLabel}, ${columnLabel})`);
      }
    }

    return cellErrors;
  }

  /**
   * The grid as Frappe's Data Import reads it: the rows of a document follow
   * each other, and only the first holds the document's own values.
   */
  getImportFile(): ImportFile {
    const columns = this.getImportColumns();
    const rows = [['docstatus', ...columns.map(({ key }) => key)]];
    const gridRows: number[] = [];
    for (const indexes of this.getDocumentRows()) {
      const parentTexts = columns.map((column) =>
        this.getParentText(indexes, column)
      );
      for (const [position, index] of indexes.entries()) {
        rows.push(
          this.getImportRow(index, columns, position ? null : parentTexts)
        );
        gridRows.push(index);
      }
    }

    return { csv: generateCSV(rows), gridRows };
  }

  /**
   * One grid row as a file row. A document's first row gets `parentTexts` and
   * its docstatus, so Frappe starts a new document there even if the other
   * parent cells are empty; later rows leave the parent cells empty.
   */
  getImportRow(
    index: number,
    columns: ImportColumn[],
    parentTexts: string[] | null
  ): string[] {
    const cells = columns.map((column, i) =>
      column.field.parentSchemaChildField
        ? this.getCellText(this.valueMatrix[index], column)
        : (parentTexts?.[i] ?? '')
    );
    return [parentTexts ? '0' : '', ...cells];
  }

  /** The assigned columns Frappe imports, with the column key it reads each from. */
  getImportColumns(): ImportColumn[] {
    const schema = this.fyo.schemaMap[this.schemaName]!;
    return this.assignedTemplateFields.flatMap((fieldKey, index) => {
      const field = this.templateFieldsMap.get(fieldKey ?? '');
      const key = field && getImportColumnKey(field, schema);
      return key ? [{ index, field, key }] : [];
    });
  }

  /** Grid rows by document, as the name column groups them. Rows without a name are left out. */
  getDocumentRows(): number[][] {
    const nameIndex = this.getNameIndex();
    const documents = new Map<string, number[]>();
    for (const [index, row] of this.valueMatrix.entries()) {
      const name = row[nameIndex]?.value;
      if (typeof name === 'string') {
        documents.set(name, [...(documents.get(name) ?? []), index]);
      }
    }

    return [...documents.values()];
  }

  /** The name a grid row gives its document. */
  getRowName(index: number): string {
    return String(this.valueMatrix[index]?.[this.getNameIndex()]?.value ?? '');
  }

  getNameIndex(): number {
    return this.assignedTemplateFields.indexOf(`${this.schemaName}.name`);
  }

  /** A document's value in a parent column: its last row with one wins. */
  getParentText(indexes: number[], column: ImportColumn): string {
    const texts = indexes.map((index) =>
      this.getCellText(this.valueMatrix[index], column)
    );
    return texts.findLast(Boolean) ?? '';
  }

  /** A cell as text Frappe's Data Import parses. */
  getCellText(
    row: ValueMatrix[number],
    { index, field }: ImportColumn
  ): string {
    const value = row[index]?.value;
    if (value === null || value === undefined) {
      return '';
    }

    if (isPesa(value)) {
      return String(value.float);
    }

    if (field.fieldtype === FieldTypeEnum.Datetime && value instanceof Date) {
      return getSystemDatetime(value);
    }

    return String(Converter.toRawValue(value, field, this.fyo) ?? '');
  }

  selectParsed(parsed: string[][]): void {
    if (!parsed?.length) {
      return;
    }

    let startIndex = -1;
    let templateFieldsAssigned;

    for (let i = 3; i >= 0; i--) {
      const row = parsed[i];
      if (!row?.length) {
        continue;
      }

      templateFieldsAssigned = this.assignTemplateFieldsFromParsedRow(row);
      if (templateFieldsAssigned) {
        startIndex = i + 1;
        break;
      }
    }

    if (!templateFieldsAssigned) {
      this.clearAndResizeAssignedTemplateFields(parsed[0].length);
    }

    if (startIndex === -1) {
      startIndex = 0;
    }

    this.assignValueMatrixFromParsed(parsed.slice(startIndex));
  }

  clearAndResizeAssignedTemplateFields(size: number) {
    for (let i = 0; i < size; i++) {
      if (i >= this.assignedTemplateFields.length) {
        this.assignedTemplateFields.push(null);
      } else {
        this.assignedTemplateFields[i] = null;
      }
    }
  }

  assignValueMatrixFromParsed(parsed: string[][]) {
    if (!parsed?.length) {
      return;
    }

    for (const row of parsed) {
      this.pushToValueMatrixFromParsedRow(row);
    }
  }

  pushToValueMatrixFromParsedRow(row: string[]) {
    const vmRow: ValueMatrix[number] = [];
    for (let i = 0; i < row.length; i++) {
      const rawValue = row[i];
      const index = Number(i);

      if (index >= this.assignedTemplateFields.length) {
        this.assignedTemplateFields.push(null);
      }

      vmRow.push(this.getValueMatrixItem(index, rawValue));
    }

    this.valueMatrix.push(vmRow);
  }

  setTemplateField(index: number, key: string | null) {
    if (index >= this.assignedTemplateFields.length) {
      this.assignedTemplateFields.push(key);
    } else {
      this.assignedTemplateFields[index] = key;
    }

    this.updateValueMatrixColumn(index);
  }

  updateValueMatrixColumn(index: number) {
    for (const row of this.valueMatrix) {
      const vmi = this.getValueMatrixItem(index, row[index].rawValue ?? null);

      if (index >= row.length) {
        row.push(vmi);
      } else {
        row[index] = vmi;
      }
    }
  }

  getValueMatrixItem(index: number, rawValue: RawValue) {
    const vmi: ValueMatrixItem = { rawValue };
    const key = this.assignedTemplateFields[index];
    if (!key) {
      return vmi;
    }

    const tf = this.templateFieldsMap.get(key);
    if (!tf) {
      return vmi;
    }

    if (vmi.rawValue === '') {
      vmi.value = null;
      return vmi;
    }

    if ('options' in tf && typeof vmi.rawValue === 'string') {
      return this.getOptionFieldVmi(vmi, tf);
    }

    try {
      vmi.value = Converter.toDocValue(rawValue, tf, this.fyo);
    } catch {
      vmi.error = true;
    }

    return vmi;
  }

  getOptionFieldVmi(
    { rawValue }: ValueMatrixItem,
    tf: OptionField & TemplateFieldProps
  ): ValueMatrixItem {
    if (typeof rawValue !== 'string') {
      return { error: true, value: null, rawValue };
    }

    if (!tf?.options.length) {
      return { value: null, rawValue };
    }

    if (!this.optionsMap.labelValueMap[tf.fieldKey]) {
      const values = new Set(tf.options.map(({ value }) => value));
      const labelValueMap = getValueMapFromList(tf.options, 'label', 'value');

      this.optionsMap.labelValueMap[tf.fieldKey] = labelValueMap;
      this.optionsMap.values[tf.fieldKey] = values;
    }

    const hasValue = this.optionsMap.values[tf.fieldKey].has(rawValue);
    if (hasValue) {
      return { value: rawValue, rawValue };
    }

    const value = this.optionsMap.labelValueMap[tf.fieldKey][rawValue];
    if (value) {
      return { value, rawValue };
    }

    return { error: true, value: null, rawValue };
  }

  /** Assigns the columns a header row names; false when the row is not a header row. */
  assignTemplateFieldsFromParsedRow(row: string[]): boolean {
    if (!this.isHeaderRow(row)) {
      return false;
    }

    for (const [index, value] of row.entries()) {
      this.assignedTemplateFields[index] = this.getPickedFieldKey(value);
    }

    return true;
  }

  isHeaderRow(row: string[]): boolean {
    const values = row.filter(Boolean);
    return (
      row.some((value) => this.templateFieldsMap.has(value)) ||
      (values.length > 0 &&
        values.every((value) => this.templateFieldKeysByHeader.has(value)))
    );
  }

  /** The picked template field that a field key or header names. */
  getPickedFieldKey(value: string): string | null {
    const key = this.templateFieldsMap.has(value)
      ? value
      : this.templateFieldKeysByHeader.get(value);
    return key && this.templateFieldsPicked.get(key) ? key : null;
  }

  addRow() {
    const valueRow: ValueMatrix[number] = this.assignedTemplateFields.map(
      (key) => {
        key ??= '';
        const { fieldtype } = this.templateFieldsMap.get(key) ?? {};
        let value = null;
        if (fieldtype) {
          value = getEmptyValuesByFieldTypes(fieldtype, this.fyo);
        }

        return { value };
      }
    );

    this.valueMatrix.push(valueRow);
  }

  removeRow(index: number) {
    this.valueMatrix = this.valueMatrix.filter((_, i) => i !== index);
  }

  getCSVTemplate(): string {
    const headers: string[] = [];

    for (const [fieldKey, picked] of this.templateFieldsPicked.entries()) {
      if (!picked) {
        continue;
      }

      const header = this.templateHeadersByFieldKey.get(fieldKey);
      if (!header) {
        continue;
      }

      headers.push(header);
    }

    return generateCSV([headers]);
  }
}

function getTemplateHeaderMaps(fields: TemplateField[]) {
  const headerCounts = new Map<string, number>();
  for (const field of fields) {
    const header = getColumnLabel(field);
    headerCounts.set(header, (headerCounts.get(header) ?? 0) + 1);
  }

  const fieldKeysByHeader = new Map<string, string>();
  const headersByFieldKey = new Map<string, string>();
  for (const field of fields) {
    const baseHeader = getColumnLabel(field);
    let header = baseHeader;
    if ((headerCounts.get(baseHeader) ?? 0) > 1) {
      header = `${baseHeader} (${field.schemaLabel})`;
    }

    if (fieldKeysByHeader.has(header)) {
      header = `${baseHeader} [${field.fieldKey}]`;
    }

    fieldKeysByHeader.set(header, field.fieldKey);
    headersByFieldKey.set(field.fieldKey, header);
  }

  return { fieldKeysByHeader, headersByFieldKey };
}

function getTemplateFields(schemaName: string, fyo: Fyo): TemplateField[] {
  const fields: TemplateField[] = [];
  const schemas: { schema: Schema; parentSchemaChildField?: TargetField }[] = [
    { schema: fyo.schemaMap[schemaName]! },
  ];
  while (schemas.length) {
    const { schema, parentSchemaChildField } = schemas.pop()!;
    for (const field of schema.fields) {
      if (shouldSkipField(field, schema)) {
        continue;
      }

      if (field.fieldtype === FieldTypeEnum.Table) {
        schemas.push({
          schema: fyo.schemaMap[field.target]!,
          parentSchemaChildField: field,
        });
      }

      if (!skippedFieldsTypes.includes(field.fieldtype)) {
        fields.push(getTemplateField(field, schema, parentSchemaChildField));
      }
    }
  }

  return fields;
}

/** An editable copy of the field. Child rows are checked on save, so none is required here. */
function getTemplateField(
  field: Field,
  schema: Schema,
  parentSchemaChildField?: TargetField
): TemplateField {
  return {
    ...field,
    readOnly: false,
    required: schema.isChild ? false : field.required,
    schemaName: schema.name,
    schemaLabel: schema.label,
    fieldKey: `${schema.name}.${field.fieldname}`,
    parentSchemaChildField,
  };
}

export function getColumnLabel(field: TemplateField): string {
  if (field.parentSchemaChildField) {
    return `${field.label} (${field.parentSchemaChildField.label})`;
  }

  return field.label;
}

function shouldSkipField(field: Field, schema: Schema): boolean {
  if (field.computed || field.meta) {
    return true;
  }

  if (schema.naming === 'numberSeries' && field.fieldname === 'name') {
    return false;
  }

  if (field.hidden) {
    return true;
  }

  if (field.readOnly && !field.required) {
    return true;
  }

  return false;
}

/**
 * The column Frappe's Data Import reads a template field from. Frappe names
 * numbered documents itself, so their name only groups the rows and is not
 * imported, and neither are child row names.
 */
function getImportColumnKey(
  field: TemplateField,
  schema: Schema
): string | null {
  if (field.parentSchemaChildField) {
    const table = field.parentSchemaChildField.frappeFieldname;
    return field.frappeFieldname ? `${table}.${field.frappeFieldname}` : null;
  }

  if (field.frappeFieldname) {
    return field.frappeFieldname;
  }

  if (field.fieldname !== 'name') {
    throw new Error(`${field.fieldKey} has no DocType field to import`);
  }

  return schema.naming === 'manual' ? 'name' : null;
}

/** A datetime as the naive system time Frappe stores. */
function getSystemDatetime(date: Date): string {
  const timeZone = globalThis.window?.frappe?.boot?.time_zone as
    { system?: string } | undefined;
  return DateTime.fromJSDate(date, { zone: timeZone?.system }).toFormat(
    'yyyy-MM-dd HH:mm:ss'
  );
}

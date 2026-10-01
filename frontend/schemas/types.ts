import type { Filter } from 'src/frappe/api';
import { PropertyEnum } from 'utils/types';

export type FieldType =
  | 'Data'
  | 'Select'
  | 'Link'
  | 'Date'
  | 'Datetime'
  | 'Table'
  | 'AutoComplete'
  | 'Check'
  | 'AttachImage'
  | 'DynamicLink'
  | 'Int'
  | 'Float'
  | 'Currency'
  | 'Text'
  | 'Color'
  | 'Button'
  | 'Attachment';

export const FieldTypeEnum: PropertyEnum<Record<FieldType, FieldType>> = {
  Data: 'Data',
  Select: 'Select',
  Link: 'Link',
  Date: 'Date',
  Datetime: 'Datetime',
  Table: 'Table',
  AutoComplete: 'AutoComplete',
  Check: 'Check',
  AttachImage: 'AttachImage',
  DynamicLink: 'DynamicLink',
  Int: 'Int',
  Float: 'Float',
  Currency: 'Currency',
  Text: 'Text',
  Color: 'Color',
  Button: 'Button',
  Attachment: 'Attachment',
};

type OptionFieldType = 'Select' | 'AutoComplete' | 'Color';
type TargetFieldType = 'Table' | 'Link';
type NumberFieldType = 'Int' | 'Float' | 'Currency';
type DynamicLinkFieldType = 'DynamicLink';
type BaseFieldType = Exclude<
  FieldType,
  TargetFieldType | DynamicLinkFieldType | OptionFieldType | NumberFieldType
>;

export type RawValue = string | number | boolean | null;

export interface BaseField {
  fieldname: string;             // The DocType's fieldname
  fieldtype: BaseFieldType;      // UI Descriptive field types that map to column types
  label: string;                 // Translateable UI facing name
  schemaName?: string;           // Convenient access to schemaName incase just the field is passed
  required?: boolean;            // Implies Not Null
  hidden?: boolean;              // UI Facing config, whether field is shown in a form
  invisible?: boolean;           // UI Facing config, whether field is invisible but occupies space
  readOnly?: boolean;            // UI Facing config, whether field is editable
  setOnlyOnce?: boolean;         // Read only once the document is saved
  description?: string;          // UI Facing, translateable, used for inline documentation
  default?: RawValue;            // Default value of a field, should match the db type
  placeholder?: string;          // UI Facing config, form field placeholder
  groupBy?: string;              // UI Facing used in dropdowns fields
  meta?: boolean;                // Field is a meta field, i.e. only for the db, not UI
  filter?: boolean;              // UI Facing config, whether to be used to filter the List.
  computed?: boolean;            // Computed values are not stored in the database.
  section?: string;              // UI Facing config, for grouping by sections
  tab?: string;                  // UI Facing config, for grouping by tabs
  isCustom?: boolean;            // Whether the field is a custom field
  bold?: boolean;                // UI Facing config, whether to make the label bold
  sub_label?: string;
  filters?: Filter[];            // A Link's own search filters
  linkFilters?: Filter[];        // A Link's search filters, from its DocField's link_filters
  getOptions?: () => Promise<{ label: string; value: string }[]>;
  rows?: number;                 // UI Facing config, number of rows for Text field (default 3)
}

export type SelectOption = { value: string; label: string };
export interface OptionField extends Omit<BaseField, 'fieldtype'> {
  fieldtype: OptionFieldType;
  options: SelectOption[];
  optionLabels?: Record<string, string>; // Labels of option values that need one
  states?: Record<string, string>; // DocType state colour by `status` option value
  allowCustom?: boolean;
}

export interface TargetField extends Omit<BaseField, 'fieldtype'> {
  fieldtype: TargetFieldType;
  target: string;                // Name of the table or group of tables to fetch values
  create?: boolean;              // Whether to show Create in the dropdown
  edit?: boolean;                // Whether the Table has quick editable columns
}

export interface DynamicLinkField extends Omit<BaseField, 'fieldtype'> {
  fieldtype: DynamicLinkFieldType;
  references: string;            // Reference to an option field that links to schema
}

export interface NumberField extends Omit<BaseField, 'fieldtype'> {
  fieldtype: NumberFieldType;
  minvalue?: number;             // UI Facing used to restrict lower bound
  maxvalue?: number;             // UI Facing used to restrict upper bound
}

export type Field =
  | BaseField
  | OptionField
  | TargetField
  | DynamicLinkField
  | NumberField;

export type Naming = 'autoincrement' | 'random' | 'numberSeries' | 'manual';

export interface Schema {
  name: string;                  // Schema name, e.g. SalesInvoice
  label: string;                 // Translateable UI facing name
  fields: Field[];               // Maps to database columns
  isTree?: boolean;              // Used for nested set, eg for Chart of Accounts
  isChild?: boolean;             // Indicates a child table, i.e table with "parent" FK column
  isSingle?: boolean;            // A single, like a settings DocType
  tableFields?: string[]         // Used for displaying childTableFields
  isSubmittable?: boolean;       // For transactional types, values considered only after submit
  quickEditFields?: string[];    // Used to get fields for the quickEditForm
  fileFields?: string[];         // Fields of export and import files, in order
  linkDisplayField?:string;      // Display field if inline editable
  create?: boolean               // Whether the user can create an entry from the ListView
  naming?: Naming;               // Used for assigning name, default is 'random' else 'numberSeries' if present
  titleField?: string;           // Main display field
}

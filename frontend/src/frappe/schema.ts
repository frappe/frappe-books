import {
  getFieldProperties,
  isReferenceField,
  isTableDocField,
} from './fieldProperties';
import type { Field, Naming, OptionField, Schema } from 'schemas/types';
import type { Filter } from './api';
import type { DocField, DocTypeMeta } from './meta';
import { getAccessoryCompany, isAccessoryMode } from './mode';
import {
  DEFAULT_SECTION,
  getPositionedFields,
  layOutAccessoryFields,
  type AccessoryLayout,
} from './accessoryLayout';

/** What a Frappe-backed model shows that its DocType has no property for. */
export interface Presentation {
  label: string;
  quickEditFields?: string[];
  /** The name field: asked for when the DocType names by prompt, else shown read only, or only in lists when hidden. */
  nameField?: {
    label: string;
    placeholder?: string;
    /** An AutoComplete offers the names the model's `lists.name` gives. */
    fieldtype?: 'Data' | 'AutoComplete';
    hidden?: boolean;
  };
  /** How fields show what their DocFields cannot say, by fieldname. */
  fields?: Record<string, FieldPresentation>;
  /** False when the list offers no new document, e.g. accounts made in the Chart of Accounts. */
  create?: boolean;
  /**
   * DocType fields /books neither shows nor saves: fields the server owns,
   * like a tree's nested set, or fields of a Frappe doctype Books does not use.
   */
  omitFields?: string[];
  /** Values of omitted fields that each document /books creates gets, e.g. an enabled Currency. */
  insertValues?: Record<string, unknown>;
  /**
   * Fields a new document asks for that its DocType does not hold, like the
   * address a new customer makes its primary Address from, as ERPNext's quick
   * entry does. The server reads them on insert; a saved document hides them.
   */
  insertFields?: Field[];
  /**
   * Fields a form shows, each after the field it names, that the DocType does
   * not hold: the model keeps their values in DocType fields, like a
   * payment's positive Write Off in its signed deductions.
   */
  clientFields?: ClientField[];
  /** The field a link to the doctype shows instead of the name. */
  linkDisplayField?: string;
  /**
   * The field that titles a document its DocType names by script, like an
   * Address's address_title; a link's typed text goes in it on Create.
   */
  titleField?: string;
  /** Table columns, where /books orders them unlike the DocType's in_list_view fields. */
  tableFields?: string[];
  /** A phone row's fields, title first and amount last, where they differ from `tableFields`. */
  mobileTableFields?: string[];
  /** The field a phone row shows under its amount, labelled. */
  mobileRowDetail?: string;
  /** Phone row fields shown with their labels, like a reference's Outstanding; the amount's label goes under it. */
  mobileLabelledFields?: string[];
  /**
   * The fields of list exports, import templates and quick views, in Books'
   * order, where it differs from the DocType's; fields the server fills are
   * left out.
   */
  fileFields?: string[];
}

export type ClientField = Field & { after: string };

/**
 * Field properties that no DocField property says, like Select option labels,
 * the doctypes a DocType reference offers (`options`), whether an Autocomplete
 * takes values that are not options, a link's grouping, a table whose rows
 * open in the row editor (`edit`), and a Link that offers no Create (`create:
 * false`). A Link offers Create unless its presentation says not.
 */
export type FieldPresentation = Partial<Field> &
  Pick<OptionField, 'optionLabels' | 'allowCustom'> & {
    create?: boolean;
    edit?: boolean;
    card?: boolean;
  };

/** Presentations of Links that offer no Create, by fieldname. */
export function withoutCreate(
  fieldnames: string[]
): Record<string, FieldPresentation> {
  return Object.fromEntries(
    fieldnames.map((fieldname) => [fieldname, { create: false }])
  );
}

/**
 * The tab and section a Books Custom Form puts each custom field in, by
 * fieldname, and the row's own fieldname, which export files key it by.
 */
export type Placements = Record<
  string,
  { section?: string; tab?: string; books_fieldname?: string }
>;

export interface SchemaContext {
  /** Books schema names by doctype; link targets use them. */
  schemaNames: Record<string, string | undefined>;
  /** The user's roles, which decide the permission levels they can read and write. */
  roles: string[];
  placements: Placements;
  /** Accessory mode: the Books twin's layout of an ERPNext DocType. */
  layout?: AccessoryLayout;
}

// Fields every Books document has that the server sets, e.g. the one company it belongs to.
// An ERPNext document keeps its company, hidden, as the one accessory mode works on.
const SERVER_FIELDS = ['company'];

// Standard columns, labelled as the list filters show them.
const STANDARD_FIELDS = [
  { fieldname: 'owner', label: 'Created By', fieldtype: 'Data' },
  { fieldname: 'modified_by', label: 'Modified By', fieldtype: 'Data' },
  { fieldname: 'creation', label: 'Created', fieldtype: 'Datetime' },
  { fieldname: 'modified', label: 'Modified', fieldtype: 'Datetime' },
];

/**
 * The schema /books forms, tables and lists render for a Frappe DocType.
 * Its fields keep their Frappe fieldnames; breaks become Books tabs and sections.
 */
export function toSchema(
  meta: DocTypeMeta,
  name: string,
  presentation: Presentation,
  context: SchemaContext
): Schema {
  const docFields = withClientFields(
    getDocFields(meta, context, presentation),
    presentation
  );
  const fields = [
    ...getNameFields(meta, presentation, docFields),
    ...getInsertFields(presentation),
    ...getMetaFields(meta),
  ].map((field) => ({ ...field, schemaName: name }) as Field);

  return {
    name,
    label: presentation.label,
    fields,
    naming: getNaming(meta),
    titleField:
      presentation.titleField ||
      meta.title_field ||
      getNamingField(meta) ||
      'name',
    quickEditFields: presentation.quickEditFields,
    linkDisplayField: presentation.linkDisplayField,
    create: presentation.create,
    fileFields: presentation.fileFields,
    mobileTableFields: presentation.mobileTableFields,
    mobileRowDetail: presentation.mobileRowDetail,
    mobileLabelledFields: presentation.mobileLabelledFields,
    tableFields: presentation.tableFields ?? getListViewFields(meta, context),
    isChild: !!meta.istable,
    isSingle: !!meta.issingle,
    isSubmittable: !!meta.is_submittable,
    isTree: !!meta.is_tree,
  };
}

/** The in_list_view columns; accessory mode takes the Books twin's that ERPNext has. */
function getListViewFields(
  meta: DocTypeMeta,
  context: SchemaContext
): string[] {
  const fieldnames = new Set(meta.fields.map(({ fieldname }) => fieldname));
  return (context.layout?.meta ?? meta).fields
    .filter((field) => field.in_list_view && fieldnames.has(field.fieldname))
    .map((field) => field.fieldname);
}

/** The field that names a document of a DocType named `field:<fieldname>`. */
export function getNamingField(meta: DocTypeMeta): string | undefined {
  const [rule, fieldname] = (meta.autoname ?? '').split(':');
  return rule.toLowerCase() === 'field' ? fieldname : undefined;
}

/**
 * Fields in DocType order; custom fields placed by a Books Custom Form come
 * last, as Books adds them. Accessory mode lays them out by the Books twin.
 */
function getDocFields(
  meta: DocTypeMeta,
  context: SchemaContext,
  presentation: Presentation
): Field[] {
  const fieldContext: FieldContext = {
    schemaNames: context.schemaNames,
    levels: getPermlevels(meta, context.roles),
    namingField: getNamingField(meta),
    fields: presentation.fields ?? {},
    states: getStates(meta),
  };
  const omitted = [
    ...(isAccessoryMode() ? [] : SERVER_FIELDS),
    ...(presentation.omitFields ?? []),
  ];
  const shown = {
    ...meta,
    fields: meta.fields.filter((field) => !omitted.includes(field.fieldname)),
  };
  const convert = (docfield: DocField) => toField(docfield, fieldContext);
  if (context.layout) {
    return layOutAccessoryFields(shown, context.layout, convert);
  }

  const fields: Field[] = [];
  const placed: Field[] = [];
  for (const { docfield, section, tab } of getPositionedFields(shown)) {
    const field = convert(docfield);
    const placement = context.placements[docfield.fieldname];
    if (placement) {
      placed.push({
        ...field,
        section: placement.section || DEFAULT_SECTION,
        tab: placement.tab || undefined,
      });
    } else {
      fields.push({ ...field, section, tab });
    }
  }

  // In the order of the Books Custom Form's rows.
  const order = Object.keys(context.placements);
  placed.sort(
    (a, b) => order.indexOf(a.fieldname) - order.indexOf(b.fieldname)
  );
  return [...fields, ...placed];
}

/**
 * Dynamic properties (depends_on and the like) stay unset, so a doc's own
 * rules decide them; see `FrappeDoc`.
 */
function toField(docfield: DocField, context: FieldContext): Field {
  const { fieldname } = docfield;
  const shown = context.fields[fieldname] ?? {};
  // Frappe colours a document's `status` by the DocType state of the same title.
  const states = fieldname === 'status' ? context.states : undefined;
  const properties = getFieldProperties(
    { fieldname, optionLabels: shown.optionLabels } as Field,
    { ...docfield, states }
  ) as Partial<Field> & { target?: string };
  const { levels, schemaNames } = context;
  const level = docfield.permlevel ?? 0;
  const field = {
    ...properties,
    ...(isReferenceField(docfield) && getReferenceProperties(schemaNames)),
    fieldname,
    // The naming field is set once: changing it later would not rename the document.
    setOnlyOnce: properties.setOnlyOnce || fieldname === context.namingField,
    label: docfield.label ?? docfield.fieldname,
    placeholder: docfield.placeholder,
    sub_label: docfield.description,
    isCustom: !!docfield.is_custom_field,
    // The server fills a field the user's roles cannot write.
    required: docfield.reqd && levels.write.has(level) ? true : undefined,
    readOnly: docfield.read_only || !levels.write.has(level) ? true : undefined,
    hidden: docfield.hidden || !levels.read.has(level) ? true : undefined,
    create: isLink(docfield) || undefined,
    linkFilters: getLinkFilters(docfield),
    ...shown,
    ...(SERVER_FIELDS.includes(fieldname) && {
      hidden: true,
      readOnly: true,
      default: getAccessoryCompany(),
    }),
  } as Field & { target?: string; create?: boolean; allowCustom?: boolean };

  if (isTableDocField(docfield)) {
    field.target = getTableSchemaName(docfield.options!);
  } else if (properties.target) {
    field.target = schemaNames[properties.target] ?? properties.target;
    // Books has no form to create a record of a doctype it does not show, like an ERPNext Cost Center.
    field.create &&= !!schemaNames[properties.target];
  }

  return field;
}

/** The Custom Field that holds a Books custom field, as `frappe_books.customization` names it. */
export function getCustomFieldname(fieldname: string): string {
  return `custom_books_${fieldname.replace(/[ -]/g, '_').toLowerCase()}`;
}

/** The schema of a table's rows: its DocType without `Books ` and spaces, e.g. `SalesInvoiceItem`. */
export function getTableSchemaName(doctype: string): string {
  return doctype.replace(/^Books /, '').replaceAll(' ', '');
}

/** A DocField's link_filters as list filters; `eval:` values need Desk's form script, so they are left out. */
function getLinkFilters({ link_filters }: DocField): Filter[] | undefined {
  if (!link_filters) {
    return undefined;
  }

  type LinkFilter = [string, string, string, unknown];
  return (JSON.parse(link_filters) as LinkFilter[])
    .filter(([, , , value]) => !String(value).startsWith('eval:'))
    .map(([, fieldname, operator, value]) => [fieldname, operator, value]);
}

function isLink({ fieldtype }: DocField): boolean {
  return fieldtype === 'Link' || fieldtype === 'Dynamic Link';
}

/** A field that holds a doctype offers the Books doctypes, shown by their schema names. */
function getReferenceProperties(
  schemaNames: SchemaContext['schemaNames']
): Partial<OptionField> {
  const options = Object.entries(schemaNames).map(([doctype, schemaName]) => ({
    value: doctype,
    label: schemaName ?? doctype,
  }));
  return { fieldtype: 'Select', options };
}

/**
 * A prompt-named doctype asks for the name first, after an image that heads
 * the form. Another doctype shows its name read only, first, when the model
 * labels it; otherwise the name is a meta field. A single has no ID.
 */
function getNameFields(
  meta: DocTypeMeta,
  presentation: Presentation,
  fields: Field[]
): Field[] {
  if (meta.issingle) {
    return fields;
  }

  const isPrompt = meta.autoname?.toLowerCase() === 'prompt';
  if (!isPrompt && (!presentation.nameField || presentation.nameField.hidden)) {
    const namingField = getNamingField(meta);
    const label = fields.find(
      ({ fieldname }) => fieldname === namingField
    )?.label;
    const idField = {
      fieldname: 'name',
      label: presentation.nameField?.label ?? label ?? 'ID',
      fieldtype: 'Data',
    };
    return [...fields, { ...idField, meta: true } as Field];
  }

  const nameField = {
    fieldname: 'name',
    fieldtype: presentation.nameField?.fieldtype ?? 'Data',
    label: presentation.nameField?.label ?? 'Name',
    placeholder: presentation.nameField?.placeholder,
    required: true,
    readOnly: isPrompt ? undefined : true,
    section: fields[0]?.section ?? DEFAULT_SECTION,
    tab: fields[0]?.tab,
  } as Field;
  const index = isPrompt && fields[0]?.fieldtype === 'AttachImage' ? 1 : 0;
  return [...fields.slice(0, index), nameField, ...fields.slice(index)];
}

/** Client fields go after the fields they name, in their sections; they filter no list. */
function withClientFields(
  fields: Field[],
  { clientFields = [] }: Presentation
): Field[] {
  const placed = [...fields];
  for (const { after, ...field } of clientFields) {
    const index = placed.findIndex(({ fieldname }) => fieldname === after);
    const { section, tab } = placed[index] ?? {};
    const clientField = {
      ...field,
      section,
      tab,
      clientOnly: true,
      filter: false,
    };
    placed.splice(index + 1, 0, clientField as Field);
  }

  return placed;
}

/** Insert-only fields filter no list, as no column holds them. */
function getInsertFields({ insertFields = [] }: Presentation): Field[] {
  return insertFields.map((field) => ({
    ...field,
    insertOnly: true,
    filter: false,
  }));
}

function getMetaFields(meta: DocTypeMeta): Field[] {
  if (meta.istable) {
    return [];
  }

  const fields = [...STANDARD_FIELDS];
  if (meta.is_submittable) {
    fields.push({ fieldname: 'docstatus', label: 'Status', fieldtype: 'Int' });
  }

  return fields.map((field) => ({ ...field, meta: true }) as Field);
}

/** How /books names a new document; a controller that names by script numbers it as a series. */
function getNaming(meta: DocTypeMeta): Naming {
  const rule = (meta.autoname ?? '').toLowerCase();
  if (rule === 'prompt' || rule.startsWith('field:')) {
    return 'manual';
  }

  if (rule === 'autoincrement') {
    return 'autoincrement';
  }

  // Books names these by script from their number series; see SeriesNamingMixin.
  const hasSeries = meta.fields.some(
    ({ fieldname }) => fieldname === 'naming_series'
  );
  if (hasSeries || (!rule && meta.naming_rule === 'By script')) {
    return 'numberSeries';
  }

  return !rule || rule === 'hash' ? 'random' : 'numberSeries';
}

type Permlevels = { read: Set<number>; write: Set<number> };

/** What converting a DocField needs to know about its DocType and presentation. */
interface FieldContext {
  schemaNames: SchemaContext['schemaNames'];
  levels: Permlevels;
  namingField?: string;
  fields: NonNullable<Presentation['fields']>;
  states?: Record<string, string>;
}

/** The colours of the DocType's states, by title. */
function getStates(meta: DocTypeMeta): Record<string, string> | undefined {
  if (!meta.states?.length) {
    return undefined;
  }

  return Object.fromEntries(
    meta.states.map(({ title, color }) => [title, color])
  );
}

/** The permission levels the user's roles can read and write; level 0 is the document's own. */
function getPermlevels(meta: DocTypeMeta, roles: string[]): Permlevels {
  const levels: Permlevels = { read: new Set([0]), write: new Set([0]) };
  for (const perm of meta.permissions ?? []) {
    if (!roles.includes(perm.role)) {
      continue;
    }

    const level = perm.permlevel ?? 0;
    if (perm.read || perm.write) {
      levels.read.add(level);
    }

    if (perm.write) {
      levels.write.add(level);
    }
  }

  return levels;
}

import { getFieldProperties } from 'schemas/fieldProperties';
import type { Field, Naming, Schema } from 'schemas/types';
import type { DocField, DocTypeMeta } from './meta';

/** What a Frappe-backed model shows that its DocType has no property for. */
export interface Presentation {
  label: string;
  quickEditFields?: string[];
  /** The field that asks for a document's name when its DocType names by prompt. */
  nameField?: { label: string; placeholder?: string };
  /** The field a link to the doctype shows instead of the name. */
  linkDisplayField?: string;
  fields?: Record<string, FieldPresentation>;
}

/** How a form shows a field, where the DocField has no property for it. */
export interface FieldPresentation {
  /** Labels of Select values, e.g. `percentage` as `Discount Percentage`. */
  optionLabels?: Record<string, string>;
  /** A table whose rows also open in a form. */
  edit?: boolean;
}

/** The tab and section a Books Custom Form puts each custom field in, by fieldname. */
export type Placements = Record<string, { section?: string; tab?: string }>;

export interface SchemaContext {
  /** Books schema names by doctype; link and table targets use them. */
  schemaNames: Record<string, string | undefined>;
  /** The user's roles, which decide the permission levels they can read and write. */
  roles: string[];
  placements: Placements;
}

const LAYOUT_FIELDTYPES = ['Section Break', 'Column Break', 'Tab Break'];
const DEFAULT_SECTION = 'Default';

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
  const docFields = getDocFields(meta, presentation, context);
  const fields = [
    ...getNameFields(meta, presentation, docFields),
    ...getMetaFields(meta),
  ].map((field) => ({ ...field, schemaName: name }) as Field);

  return {
    name,
    label: presentation.label,
    fields,
    naming: getNaming(meta),
    titleField: meta.title_field || 'name',
    quickEditFields: presentation.quickEditFields,
    linkDisplayField: presentation.linkDisplayField,
    tableFields: meta.fields
      .filter((field) => field.in_list_view)
      .map((field) => field.fieldname),
    isChild: !!meta.istable,
    isSingle: !!meta.issingle,
    isSubmittable: !!meta.is_submittable,
    isTree: !!meta.is_tree,
  };
}

/** Fields in DocType order; custom fields placed by a Books Custom Form come last, as Books adds them. */
function getDocFields(
  meta: DocTypeMeta,
  presentation: Presentation,
  context: SchemaContext
): Field[] {
  const levels = getPermlevels(meta, context.roles);
  const fields: Field[] = [];
  const placed: Field[] = [];
  let tab: string | undefined;
  let section = DEFAULT_SECTION;
  for (const docfield of meta.fields) {
    if (docfield.fieldtype === 'Tab Break') {
      tab = docfield.label;
      section = DEFAULT_SECTION;
    } else if (docfield.fieldtype === 'Section Break') {
      section = docfield.label || DEFAULT_SECTION;
    } else if (!LAYOUT_FIELDTYPES.includes(docfield.fieldtype)) {
      const shown = getFieldPresentation(meta, docfield, presentation);
      const field = toField(docfield, shown, context.schemaNames, levels);
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
  }

  // In the order of the Books Custom Form's rows.
  const order = Object.keys(context.placements);
  placed.sort(
    (a, b) => order.indexOf(a.fieldname) - order.indexOf(b.fieldname)
  );
  return [...fields, ...placed];
}

/** A field's option labels, state colours and row editing, as /books shows them. */
function getFieldPresentation(
  meta: DocTypeMeta,
  docfield: DocField,
  presentation: Presentation
): FieldPresentation & { states?: Record<string, string> } {
  const shown = presentation.fields?.[docfield.fieldname] ?? {};
  if (docfield.fieldname !== 'status' || !meta.states?.length) {
    return shown;
  }

  // Frappe colours a document's `status` by the DocType state of the same title.
  const states = meta.states.map(({ title, color }) => [title, color]);
  return { ...shown, states: Object.fromEntries(states) };
}

/**
 * Dynamic properties (depends_on and the like) stay unset, so a doc's own
 * rules decide them; see `FrappeDoc`.
 */
function toField(
  docfield: DocField,
  shown: ReturnType<typeof getFieldPresentation>,
  schemaNames: SchemaContext['schemaNames'],
  levels: Permlevels
): Field {
  const { optionLabels, states, edit } = shown;
  const properties = getFieldProperties(
    { fieldname: docfield.fieldname, optionLabels } as Field,
    { ...docfield, states }
  ) as Partial<Field> & { target?: string };
  const level = docfield.permlevel ?? 0;
  const field = {
    ...properties,
    edit,
    fieldname: docfield.fieldname,
    label: docfield.label ?? docfield.fieldname,
    placeholder: docfield.placeholder,
    sub_label: docfield.description,
    isCustom: !!docfield.is_custom_field,
    required: docfield.reqd ? true : undefined,
    readOnly: docfield.read_only || !levels.write.has(level) ? true : undefined,
    hidden: docfield.hidden || !levels.read.has(level) ? true : undefined,
  } as Field & { target?: string; create?: boolean };

  if (properties.target) {
    field.target = schemaNames[properties.target] ?? properties.target;
  }

  if (docfield.fieldtype === 'Link') {
    field.create = !docfield.only_select;
  }

  return field;
}

/** A prompt-named doctype asks for the name first, after an image that heads the form. */
function getNameFields(
  meta: DocTypeMeta,
  presentation: Presentation,
  fields: Field[]
): Field[] {
  if (meta.autoname?.toLowerCase() !== 'prompt') {
    const idField = { fieldname: 'name', label: 'ID', fieldtype: 'Data' };
    return [...fields, { ...idField, meta: true } as Field];
  }

  const nameField = {
    fieldname: 'name',
    fieldtype: 'Data',
    label: presentation.nameField?.label ?? 'Name',
    placeholder: presentation.nameField?.placeholder,
    required: true,
    section: fields[0]?.section ?? DEFAULT_SECTION,
    tab: fields[0]?.tab,
  } as Field;
  const index = fields[0]?.fieldtype === 'AttachImage' ? 1 : 0;
  return [...fields.slice(0, index), nameField, ...fields.slice(index)];
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

function getNaming(meta: DocTypeMeta): Naming {
  const rule = (meta.autoname ?? '').toLowerCase();
  if (rule === 'prompt') {
    return 'manual';
  }

  if (rule === 'autoincrement') {
    return 'autoincrement';
  }

  // Books names these by script from their number series; see SeriesNamingMixin.
  if (meta.fields.some(({ fieldname }) => fieldname === 'number_series')) {
    return 'numberSeries';
  }

  return !rule || rule === 'hash' ? 'random' : 'numberSeries';
}

type Permlevels = { read: Set<number>; write: Set<number> };

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

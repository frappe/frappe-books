import type { Field } from 'schemas/types';
import type { DocField, DocTypeMeta } from './meta';

/** How accessory mode lays out an ERPNext DocType: by its Books twin's positions, then More details and end tabs. */
export interface AccessoryLayout {
  /** The Books twin, whose fields give positions, Books labels and what Books hides. */
  meta: DocTypeMeta;
  /** The end tab of each custom field: `custom`, `other` or an app's title. */
  tabs: Record<string, string>;
  /** The ERPNext fields with no Books position that More details always shows. */
  picks: string[];
}

export const CUSTOM_TAB = 'custom';
export const OTHER_APPS_TAB = 'other';
export const DEFAULT_SECTION = 'Default';

const LAYOUT_FIELDTYPES = ['Section Break', 'Column Break', 'Tab Break'];
// Desk renders these with form scripts; they hold no value.
const NEVER_SHOWN_FIELDTYPES = ['HTML', 'Button', 'Heading', 'Image', 'Fold'];

let appTitles: string[] = [];

/** Remembers the installed apps' titles, in install order, which orders the app tabs. */
export function setAppTitles(titles: string[]) {
  appTitles = titles;
}

/** End tabs in order: Custom, the apps' in install order, Other apps. */
export function sortEndTabs(tabs: string[]): string[] {
  const rank = (tab: string) => {
    if (tab === CUSTOM_TAB) {
      return -1;
    }

    return tab === OTHER_APPS_TAB ? Infinity : appTitles.indexOf(tab);
  };
  return [...tabs].sort((a, b) => rank(a) - rank(b));
}

type Positioned = { docfield: DocField; section: string; tab?: string };

/** The data fields of a DocType with the tab and section their breaks put them in. */
export function getPositionedFields(meta: DocTypeMeta): Positioned[] {
  const positioned: Positioned[] = [];
  let tab: string | undefined;
  let section = DEFAULT_SECTION;
  for (const docfield of meta.fields) {
    if (docfield.fieldtype === 'Tab Break') {
      tab = docfield.label;
      section = DEFAULT_SECTION;
    } else if (docfield.fieldtype === 'Section Break') {
      section = docfield.label || DEFAULT_SECTION;
    } else if (!LAYOUT_FIELDTYPES.includes(docfield.fieldtype)) {
      positioned.push({ docfield, section, tab });
    }
  }

  return positioned;
}

/**
 * An ERPNext DocType's fields as accessory mode lays them out. A field with a
 * Books twin takes the twin's position, label and hidden; its other
 * properties are ERPNext's. Books-only fields are left out. The rest follow in
 * ERPNext order: custom fields in their end tab, others in More details when
 * picked, else only while mandatory and empty (see `FrappeDoc._extrasShown`).
 * Every field stays, so the document keeps all its values when saved.
 * `placements` put ERPNext fields the twin lacks before twin fields.
 */
export function layOutAccessoryFields(
  meta: DocTypeMeta,
  layout: AccessoryLayout,
  toField: (docfield: DocField) => Field,
  placements: AccessoryPlacement[] = []
): Field[] {
  const docfields = new Map(
    meta.fields.map((field) => [field.fieldname, field])
  );
  const fields: Field[] = [];
  for (const { docfield: twin, section, tab } of getPositionedFields(
    layout.meta
  )) {
    for (const { fieldname, before } of placements) {
      const placed = docfields.get(fieldname);
      if (placed && before === twin.fieldname) {
        fields.push({ ...toField(placed), section, tab });
      }
    }

    const docfield = docfields.get(twin.fieldname);
    if (docfield) {
      const { label, hidden } = twin;
      fields.push({ ...toField({ ...docfield, label, hidden }), section, tab });
    }
  }

  const positioned = new Set(fields.map(({ fieldname }) => fieldname));
  for (const { docfield } of getPositionedFields(meta)) {
    if (!positioned.has(docfield.fieldname)) {
      fields.push(toExtraField(toField(docfield), layout));
    }
  }

  return fields;
}

/** An ERPNext field the Books twin lacks, placed before the twin field `before`, like a POS Opening Entry's POS Profile. */
export interface AccessoryPlacement {
  fieldname: string;
  before: string;
}

function toExtraField(field: Field, layout: AccessoryLayout): Field {
  const extra = { ...field, section: DEFAULT_SECTION, tab: undefined };
  if (NEVER_SHOWN_FIELDTYPES.includes(field.fieldtype)) {
    extra.hidden = true;
  }

  const appTab = layout.tabs[field.fieldname];
  if (appTab) {
    return { ...extra, appTab };
  }

  const isPicked = layout.picks.includes(field.fieldname);
  return { ...extra, moreDetails: isPicked ? 'picked' : 'ifMissing' };
}

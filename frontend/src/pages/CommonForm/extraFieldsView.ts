import type { Field } from 'schemas/types';
import { getEndTabLabel } from 'src/frappe/accessoryLayout';
import type { FrappeDoc } from 'src/frappe/document';
import { getEndTabs, getMoreDetailsFields } from 'src/frappe/extraFields';
import { getFields } from 'src/frappe/registry';
import { getRowEditFieldnames } from 'src/utils/sheetFields';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

/** The fields of More details and of each end tab, as the document's model shows them. */
export function useExtraFields(doc: MaybeRefOrGetter<FrappeDoc>) {
  const moreFields = computed(() => {
    const shown = toValue(doc);
    return shown.getFormFields(getMoreDetailsFields(shown));
  });
  const endTabs = computed(() => {
    const shown = toValue(doc);
    const tabs = [...getEndTabs(shown)].map(
      ([tab, fields]) => [tab, shown.getFormFields(fields)] as const
    );
    return new Map(tabs);
  });
  return { moreFields, endTabs };
}

export function getEndTabOptions(tabs: Map<string, Field[]>) {
  return [...tabs.keys()].map((value) => ({
    value,
    label: getEndTabLabel(value),
  }));
}

/** Where an extra field shows: More details, or the end tab that holds it. */
export function getExtraPlace(
  doc: FrappeDoc,
  fieldname: string
): { tab?: string } | undefined {
  if (getMoreDetailsFields(doc).some((f) => f.fieldname === fieldname)) {
    return {};
  }

  for (const [tab, fields] of getEndTabs(doc)) {
    if (fields.some((f) => f.fieldname === fieldname)) {
      return { tab };
    }
  }
}

/** A row's Books fields, as the standalone row editor shows them. */
export function getRowBooksFields(row: FrappeDoc): Field[] {
  const fieldnames = getRowEditFieldnames(row.schema);
  const positioned = getFields(row.schemaName, fieldnames).filter(
    (field) => !field.moreDetails && !field.appTab
  );
  return row
    .getFormFields(positioned)
    .filter((field) => !row.getFieldState(field).hidden);
}

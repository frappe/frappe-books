import { Fyo, t } from 'fyo';
import type { DocValue } from 'fyo/core/types';
import type { Report } from 'reports/Report';
import type { Field } from 'schemas/types';

export type FilterValues = Record<string, DocValue>;

export interface FilterChip {
  fieldname: string;
  label: string;
  value: string;
  isChanged: boolean;
}

/** Filter values of a new report of the same kind. */
export async function getDefaultFilters(report: Report): Promise<FilterValues> {
  const ReportClass = report.constructor as new (fyo: Fyo) => Report;
  const fresh = new ReportClass(report.fyo);
  // The server defaults are already fetched.
  fresh.serverDefaults = report.serverDefaults;
  await fresh.refreshFilters();
  return getFilterValues(fresh);
}

export function getFilterValues(report: Report): FilterValues {
  return Object.fromEntries(
    report.filters.map(({ fieldname }) => [
      fieldname,
      (report.get(fieldname) as DocValue) ?? null,
    ])
  );
}

/** Filters that differ from their defaults, and the chips that show them. */
export class MobileFilters {
  constructor(
    public report: Report,
    public defaults: FilterValues,
    public pinned: string[] = []
  ) {}

  get hasChanges() {
    return this.report.filters.some((field) => this.isChanged(field));
  }

  /** Pinned filters first, then the other changed filters. */
  get chips(): FilterChip[] {
    const pinned = this.pinned.flatMap((fieldname) => {
      const field = this.report.filters.find((f) => f.fieldname === fieldname);
      return field ? [field] : [];
    });
    const changed = this.report.filters.filter(
      (field) => !this.pinned.includes(field.fieldname) && this.isChanged(field)
    );

    return [...pinned, ...changed].map((field) => ({
      fieldname: field.fieldname,
      label: field.label,
      value: this.format(field),
      isChanged: this.isChanged(field),
    }));
  }

  isChanged(field: Field) {
    const value = this.report.get(field.fieldname) as DocValue;
    return (
      normalize(value, field) !==
      normalize(this.defaults[field.fieldname], field)
    );
  }

  format(field: Field) {
    const value = this.report.get(field.fieldname) as DocValue;
    if (field.fieldtype === 'Check') {
      return value ? t`Yes` : t`No`;
    }

    if (normalize(value, field) === null) {
      return t`All`;
    }

    return this.report.fyo.format(value, field);
  }
}

/** Empty values compare equal, and checks compare as booleans. */
function normalize(value: DocValue, field: Field) {
  if (field.fieldtype === 'Check') {
    return Boolean(value);
  }

  return value === undefined || value === '' ? null : value;
}

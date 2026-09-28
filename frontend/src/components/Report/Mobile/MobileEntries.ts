import { t } from 'fyo';
import type { Report } from 'reports/Report';
import type { PhoneEntriesLayout, ReportCell, ReportRow } from 'reports/types';
import { getColumnIndex } from './mobileRows';

export interface MobileEntry {
  key: string;
  title: string;
  amount: string;
  meta: string;
  balance: string;
  source: ReportRow;
}

/** Entries of one date, or a summary row such as an opening balance. */
export interface MobileEntrySection {
  key: string;
  date: string;
  entries: MobileEntry[];
}

/** A ledger report as entries grouped under their dates. */
export class MobileEntries {
  constructor(
    public report: Report,
    public layout: PhoneEntriesLayout
  ) {}

  get rows() {
    return this.report.reportData.filter((row) => !row.isEmpty);
  }

  getSections(limit: number): MobileEntrySection[] {
    const sections: MobileEntrySection[] = [];
    this.rows.slice(0, limit).forEach((row, index) => {
      const date = this.getDate(row);
      const last = sections.at(-1);
      const entry = this.getEntry(row, String(index));
      if (date && last?.date === date) {
        last.entries.push(entry);
      } else {
        sections.push({ key: entry.key, date, entries: [entry] });
      }
    });

    return sections;
  }

  getEntry(row: ReportRow, key: string): MobileEntry {
    const meta = this.layout.meta.map((fieldname) =>
      this.getCell(row, fieldname)
    );
    return {
      key,
      title: this.getCell(row, this.layout.title)?.value ?? '',
      amount: this.getAmount(row),
      meta: meta
        .map((cell) => cell?.value)
        .filter(Boolean)
        .join(' · '),
      balance: this.getCell(row, this.layout.balance)?.value ?? '',
      source: row,
    };
  }

  /** A signed number, or a debit or credit marked Dr or Cr. */
  getAmount(row: ReportRow) {
    const amount = this.getCell(row, this.layout.amount);
    if (!this.layout.credit) {
      const isPositive = Number(amount?.rawValue) > 0;
      return `${isPositive ? '+' : ''}${amount?.value ?? ''}`;
    }

    const credit = this.getCell(row, this.layout.credit);
    if (isNonZero(amount)) {
      return `${amount!.value} ${t`Dr`}`;
    }

    return isNonZero(credit) ? `${credit!.value} ${t`Cr`}` : '';
  }

  getDate(row: ReportRow) {
    const date = this.getCell(row, this.layout.date)?.rawValue;
    return date ? this.report.fyo.format(date, 'Date') : '';
  }

  getCell(row: ReportRow, fieldname: string): ReportCell | undefined {
    return row.cells[getColumnIndex(this.report, fieldname)];
  }
}

function isNonZero(cell?: ReportCell) {
  return !!cell?.rawValue && Number(cell.rawValue) !== 0;
}

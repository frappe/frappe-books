import { expect, test, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { choose, setValue } from './helpers/filter-fixture';
import { useBooksSession } from './helpers/session';

const bench = process.env.BOOKS_FILTER_TEST_BENCH;
const site = process.env.BOOKS_FILTER_TEST_SITE;
test.skip(!bench || !site, 'Requires an explicit Frappe test bench and site');
useBooksSession();

// Seeded rows by index; see frappe_books/tests/list_filter_records.py.
const cases = [
  ['JournalEntry', 'User Remark', 'Is', 'Beta', [3]],
  ['JournalEntry', 'User Remark', 'Is Not', 'Beta', [0, 1, 2, 4]],
  ['JournalEntry', 'User Remark', 'Contains', 'Alpha', [2, 4]],
  ['JournalEntry', 'User Remark', 'Does Not Contain', 'Alpha', [0, 1, 3]],
  ['JournalEntry', 'User Remark', 'Greater Than', 'Alpha', [2, 3, 4]],
  ['JournalEntry', 'User Remark', 'Less Than', 'Alpha', [0, 1]],
  ['JournalEntry', 'User Remark', 'Is Empty', null, [0, 1]],
  ['JournalEntry', 'User Remark', 'Is Not Empty', null, [2, 3, 4]],
  ['JournalEntry', 'Entry No', 'Contains', 'Filter 3 ', [3]],
  ['JournalEntry', 'Date', 'Greater Than', '2024-01-03', [3, 4]],
  ['JournalEntry', 'Entry Type', 'Is', 'Cash Entry', [3, 4]],
  ['JournalEntry', 'Number Series', 'Is', 'JV-', [0, 2, 4]],
  ['JournalEntry', 'Created By', 'Is', 'Administrator', [0, 2, 4]],
  ['JournalEntry', 'Modified By', 'Is', 'Guest', [1, 3]],
  ['JournalEntry', 'Created', 'Greater Than', '2024-01-03 12:00:00', [3, 4]],
  ['JournalEntry', 'Modified', 'Greater Than', '2024-02-03 12:00:00', [3, 4]],
  ['JournalEntry', 'Submitted', 'Is', 'No', [0, 3]],
  ['JournalEntry', 'Cancelled', 'Is', 'Yes', [2]],
  ['SalesInvoice', 'Invoice No', 'Contains', 'Filter invoice 3 ', [3]],
  ['SalesInvoice', 'Net Total', 'Is', '0', [0]],
  ['SalesInvoice', 'Grand Total', 'Greater Than', '112', [2, 3, 4]],
  ['SalesInvoice', 'Base Grand Total', 'Less Than', '448', [0, 1]],
] as const;

const run = Date.now().toString(36);
let records: Record<string, string[]>;

test.beforeAll(async () => {
  const { stdout } = await promisify(execFile)(
    'bench',
    [
      '--site',
      site!,
      'execute',
      'frappe_books.tests.list_filter_records.make_list_filter_records',
      '--kwargs',
      JSON.stringify({ tag: run }),
    ],
    {
      cwd: bench,
      env: { ...process.env, PYTHONPATH: path.resolve(__dirname, '../../..') },
    }
  );
  records = JSON.parse(stdout);
});

for (const [schema, field, condition, value, matches] of cases) {
  const filter = value === null ? condition : `${condition} "${value}"`;
  test(`${schema} ${field} ${filter} lists the matching records`, async ({
    page,
  }) => {
    await openSeededList(page, schema);
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page
      .getByRole('button', { name: 'Add a filter', exact: true })
      .click();
    await choose(page, 'Field', field);
    await choose(page, 'Condition', condition);
    if (value !== null) await enterValue(page, field, value);
    await page.getByRole('button', { name: 'Apply', exact: true }).click();

    const expected = matches.map((index) => records[schema][index]).sort();
    const listed = page.getByText(new RegExp(` ${run}$`));
    await expect
      .poll(async () => (await listed.allInnerTexts()).sort())
      .toEqual(expected);
    // The footer shows Frappe's count of the matching records.
    await expect(
      page.getByText(`1 - ${matches.length}`, { exact: true })
    ).toBeVisible();
  });
}

/** Opens the list limited to this run's seeded records. */
async function openSeededList(page: Page, schema: string) {
  const filters = JSON.stringify([['name', 'like', `% ${run}`]]);
  await page.goto(
    `/books/list/${schema}?filters=${encodeURIComponent(filters)}`
  );
  await expect(page.getByText('1 - 5', { exact: true })).toBeVisible();
}

async function enterValue(page: Page, field: string, value: string) {
  if (!['Date', 'Created', 'Modified'].includes(field)) {
    await setValue(page, value);
    return;
  }

  const [date, time] = value.split(' ');
  // Open the calendar on the value's month, then pick its day.
  const input = page.getByRole('combobox', { name: 'Value', exact: true });
  await input.fill(date);
  await input.press('Enter');
  await input.click();
  await page.locator(`[role="gridcell"][data-value="${date}"]`).click();
  if (time) {
    const timeInput = page.getByPlaceholder('Select time');
    await timeInput.fill(time);
    await timeInput.press('Enter');
  }
}

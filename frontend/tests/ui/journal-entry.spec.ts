import { expect, test, type Page } from '@playwright/test';
import { getLeafAccounts, insertDocument } from './helpers/records';
import { useBooksSession, waitForBooks } from './helpers/session';

// Frappe serves journal entries and the ledgers; the screens look and behave as before.
useBooksSession('/books/list/JournalEntry');

const run = Date.now().toString(36);

test('a new journal entry takes its series and balances its rows', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page).toHaveURL(/\/books\/edit\/JournalEntry\//);
  await expect(
    page.getByRole('textbox', { name: 'Entry No (required)', exact: true })
  ).toBeVisible();
  // The server's preview fills the default series once the form opens.
  await expect(
    page.getByRole('combobox', { name: 'Number Series (required)' })
  ).toHaveValue('JV-');
});

test('a submitted entry shows its accounting entries in the ledger list', async ({
  page,
}) => {
  const entry = await submitEntry(page, `JE ${run}`);
  await page.goto(`/books/edit/JournalEntry/${entry}`);
  await waitForBooks(page);
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
  // A submitted entry hides the references it has none of.
  await expect(page.getByText('User Remark', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: 'Reference Number', exact: true })
  ).toHaveValue(`JE ${run}`);

  await page.goto('/books/list/AccountingLedgerEntry');
  await waitForBooks(page);
  await expect(page.getByText(entry, { exact: true })).toHaveCount(2);
});

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('a journal entry is found and opened from its list', async ({
    page,
  }) => {
    const entry = await submitEntry(page, `Phone JE ${run}`);
    await page.goto('/books/list/JournalEntry');
    await page.getByRole('searchbox', { name: 'Search' }).fill(entry);
    const row = page.getByRole('listitem').filter({ hasText: entry });
    await expect(row).toHaveCount(1);
    await row.tap();
    await expect(page).toHaveURL(/\/books\/edit\/JournalEntry\//);
  });
});

async function submitEntry(page: Page, reference: string): Promise<string> {
  const [asset] = await getLeafAccounts(page, 'Asset');
  const [equity] = await getLeafAccounts(page, 'Equity');
  const entry = await insertDocument(page, 'Books Journal Entry', {
    entry_type: 'Journal Entry',
    reference_number: reference,
    docstatus: 1,
    accounts: [
      { account: asset, debit: 10 },
      { account: equity, credit: 10 },
    ],
  });
  return entry.name as string;
}

import { expect, test, type Page } from '@playwright/test';
import { useBooksSession } from './helpers/session';

useBooksSession();

test.beforeEach(async ({ page }) => {
  await installPaymentFixture(page);
});

test('Save retains the draft until explicit Submit refreshes the invoice and closes quick edit', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Submit', exact: true })
  ).toBeVisible();
  expect(await state(page)).toMatchObject({
    inserts: 1,
    submissions: 0,
    refreshes: 0,
  });

  await submitPayment(page);

  await expect(
    page.getByRole('button', { name: 'Close quick edit' })
  ).toHaveCount(0);
  expect(await state(page)).toMatchObject({
    submissions: 1,
    refreshes: 1,
    submitted: true,
  });
  expect(new URL(page.url()).searchParams.has('edit')).toBe(false);
});

test('a failed Save keeps edits and Save available without attempting submission', async ({
  page,
}) => {
  await page.evaluate(() => ((window as any).paymentFlow.failSave = true));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText('Payment save rejected', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Okay', exact: true }).click();

  await expect(
    page.getByRole('button', { name: 'Save', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Submit', exact: true })
  ).toHaveCount(0);
  expect(await state(page)).toMatchObject({
    dirty: true,
    inserted: false,
    submissions: 0,
    refreshes: 0,
  });

  await page.evaluate(() => ((window as any).paymentFlow.failSave = false));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Submit', exact: true })
  ).toBeVisible();
  expect(await state(page)).toMatchObject({ inserted: true, submissions: 0 });
});

test('a failed Submit retains the draft and panel for correction and retry', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.evaluate(() => ((window as any).paymentFlow.failSubmit = true));
  await submitPayment(page);
  await expect(
    page.getByText('Payment submission rejected', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Okay', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'No', exact: true })
  ).toHaveCount(0);

  await expect(
    page.getByRole('button', { name: 'Close quick edit' })
  ).toBeVisible();
  expect(await state(page)).toMatchObject({
    inserted: true,
    submitted: false,
    refreshes: 0,
  });

  await page.evaluate(async () => {
    const fixture = (window as any).paymentFlow;
    fixture.failSubmit = false;
    await fixture.payment.set('referenceId', 'Corrected reference');
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(await state(page)).toMatchObject({ submissions: 1, refreshes: 0 });
  await submitPayment(page);

  await expect(
    page.getByRole('button', { name: 'Close quick edit' })
  ).toHaveCount(0);
  expect(await state(page)).toMatchObject({
    submissions: 2,
    refreshes: 1,
    submitted: true,
  });
});

test('an invoice refresh failure reports that the payment was submitted', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.evaluate(() => ((window as any).paymentFlow.failRefresh = true));
  await submitPayment(page);

  await expect(
    page.getByText(/was submitted, but the view could not be fully updated/)
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Submit', exact: true })
  ).toHaveCount(0);
  expect(await state(page)).toMatchObject({ submissions: 1, submitted: true });
});

async function submitPayment(page: Page) {
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
}

test('a post-save refresh failure leaves a saved draft with Submit available', async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).paymentFlow.payment.once('afterSync', () => {
      throw new Error('Draft view refresh failed');
    });
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText(/was saved, but the view could not be fully updated/)
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Submit', exact: true })
  ).toBeVisible();
  expect(await state(page)).toMatchObject({
    inserts: 1,
    inserted: true,
    dirty: false,
    submissions: 0,
  });
  await submitPayment(page);
  await expect(
    page.getByRole('button', { name: 'Close quick edit' })
  ).toHaveCount(0);
});

async function state(page: Page) {
  return page.evaluate(() => {
    const fixture = (window as any).paymentFlow;
    return {
      inserts: fixture.inserts,
      submissions: fixture.submissions,
      refreshes: fixture.refreshes,
      inserted: fixture.payment.inserted,
      submitted: !!fixture.payment.submitted,
      dirty: fixture.payment.dirty,
    };
  });
}

async function installPaymentFixture(page: Page) {
  await page.evaluate(async () => {
    const app = (document.querySelector('#app') as any).__vue_app__;
    const fyo = app._context.mixins
      .find((m: any) => m.computed?.fyo)
      .computed.fyo();
    const router = app.config.globalProperties.$router;
    const fixture = ((window as any).paymentFlow = {
      inserts: 0,
      submissions: 0,
      refreshes: 0,
      failSave: false,
      failSubmit: false,
      failRefresh: false,
      payment: null as any,
      stored: null as any,
    });
    const accounts = [
      {
        name: 'Flow Cash',
        accountType: 'Cash',
        rootType: 'Asset',
        isGroup: false,
      },
      {
        name: 'Flow Creditors',
        accountType: 'Payable',
        rootType: 'Liability',
        isGroup: false,
      },
    ];
    for (const account of accounts) fyo.doc.getNewDoc('Account', account);
    fyo.doc.getNewDoc('PaymentMethod', { name: 'Cash', type: 'Cash' });
    fyo.doc.getNewDoc('Party', {
      name: 'Flow Supplier',
      role: 'Supplier',
      defaultAccount: 'Flow Creditors',
      outstandingAmount: 100,
    });
    const invoice = fyo.doc.getNewDoc('PurchaseInvoice', {
      name: 'PAYMENT-FLOW-INVOICE',
      party: 'Flow Supplier',
      account: 'Flow Creditors',
      submitted: true,
      outstandingAmount: 100,
      grandTotal: 100,
      date: new Date().toISOString(),
    });
    invoice._dirty = false;
    invoice._notInserted = false;
    fyo.db.getMapped = async (schemaName: string) => {
      if (schemaName !== 'Payment')
        throw new Error(`Unexpected mapping: ${schemaName}`);
      return {
        party: invoice.party,
        date: new Date(),
        paymentType: 'Pay',
        paymentMethod: 'Cash',
        account: 'Flow Cash',
        paymentAccount: 'Flow Creditors',
        amount: fyo.pesa(100),
        for: [
          {
            referenceType: 'PurchaseInvoice',
            referenceName: invoice.name,
            amount: fyo.pesa(100),
          },
        ],
      };
    };
    const getNewDoc = fyo.doc.getNewDoc.bind(fyo.doc);
    fyo.doc.getNewDoc = (schemaName: string, ...args: any[]) => {
      const doc = getNewDoc(schemaName, ...args);
      if (schemaName === 'Payment') {
        fixture.payment = doc;
        doc.afterSubmit = () => {
          throw new Error('Browser accounting hooks must not run');
        };
      }
      return doc;
    };

    // All fixture writes stay in memory; the server supplies only the app shell.
    fyo.db.insert = async (schemaName: string, values: any) => {
      if (schemaName !== 'Payment')
        throw new Error(`Unexpected insert: ${schemaName}`);
      fixture.inserts++;
      if (fixture.failSave) throw new Error('Payment save rejected');
      fixture.stored = { ...values, submitted: false };
      return { ...fixture.stored };
    };
    fyo.db.update = async (schemaName: string, values: any) => {
      if (schemaName !== 'Payment')
        throw new Error(`Unexpected update: ${schemaName}`);
      fixture.stored = { ...values };
      return { ...fixture.stored };
    };
    fyo.db.runLifecycleAction = async (action: string, schemaName: string) => {
      if (action !== 'submit' || schemaName !== 'Payment')
        throw new Error('Unexpected lifecycle action');
      fixture.submissions++;
      if (fixture.failSubmit) throw new Error('Payment submission rejected');
      fixture.stored = { ...fixture.stored, submitted: true };
      return { ...fixture.stored };
    };
    const getAll = fyo.db.getAll.bind(fyo.db);
    fyo.db.getAll = (schemaName: string, ...args: any[]) =>
      schemaName === 'Account' ? accounts : getAll(schemaName, ...args);
    const get = fyo.db.get.bind(fyo.db);
    fyo.db.get = async (schemaName: string, name: string, ...args: any[]) => {
      if (schemaName === 'Payment' && name === fixture.payment?.name)
        return { ...fixture.stored };
      if (schemaName === 'PurchaseInvoice' && name === invoice.name) {
        fixture.refreshes++;
        if (fixture.failRefresh) throw new Error('Invoice refresh rejected');
        return { ...invoice.getValidDict(), outstandingAmount: fyo.pesa(0) };
      }
      return get(schemaName, name, ...args);
    };

    await router.push(`/edit/PurchaseInvoice/${invoice.name}`);
    const action = fyo.models.PurchaseInvoice.getActions(fyo).find(
      (entry: any) => entry.label === 'Payment'
    );
    await action.action(invoice, router);
  });
}

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
    await fixture.payment.set('reference_id', 'Corrected reference');
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
      openPayment: null as any,
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

    // Frappe serves the payment; all fixture writes stay in memory.
    const modified = '2026-09-30 10:00:00.000000';
    const answer = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    const reject = (message: string) =>
      answer({ errors: [{ type: 'ValidationError', message }] }, 417);
    const handlers: Record<string, (body: any) => Response> = {
      'POST /api/method/frappe.model.mapper.make_mapped_doc': () =>
        answer({
          message: {
            doctype: 'Books Payment',
            party: invoice.party,
            date: '2026-09-30 10:00:00',
            payment_type: 'Pay',
            payment_method: 'Cash',
            account: 'Flow Creditors',
            payment_account: 'Flow Cash',
            amount: 100,
            payment_references: [
              {
                reference_type: 'Books Purchase Invoice',
                reference_name: invoice.name,
                amount: 100,
              },
            ],
          },
        }),
      'POST /api/v2/method/run_doc_method': ({ method, document }) => {
        if (method === 'preview') {
          const number_series = document.number_series || 'PAY-';
          return answer({ docs: [{ ...document, number_series }] });
        }

        fixture.submissions++;
        if (fixture.failSubmit) return reject('Payment submission rejected');
        fixture.stored = { ...document, docstatus: 1, modified };
        return answer({ docs: [fixture.stored] });
      },
      'POST /api/v2/document/Books Payment': (values) => {
        fixture.inserts++;
        if (fixture.failSave) return reject('Payment save rejected');
        fixture.stored = {
          ...values,
          name: 'PAY-FLOW',
          docstatus: 0,
          modified,
        };
        return answer({ data: fixture.stored });
      },
      'PUT /api/v2/document/Books Payment/PAY-FLOW': (values) => {
        fixture.stored = { ...values, docstatus: 0, modified };
        return answer({ data: fixture.stored });
      },
      'GET /api/v2/document/Books Payment/PAY-FLOW': () =>
        answer({ data: fixture.stored }),
    };
    const fetch = window.fetch.bind(window);
    window.fetch = async (input: any, init: any = {}) => {
      const url = new URL(String(input), window.location.origin);
      const key = `${init.method ?? 'GET'} ${decodeURIComponent(url.pathname)}`;
      const handler = handlers[key];
      return handler
        ? handler(JSON.parse(init.body ?? '{}'))
        : fetch(input, init);
    };

    // Fixture records exist only in the browser, so they keep the doctype-level rights.
    fyo.db.getDocPermissions = async () => undefined;
    const getAll = fyo.db.getAll.bind(fyo.db);
    fyo.db.getAll = (schemaName: string, ...args: any[]) =>
      schemaName === 'Account' ? accounts : getAll(schemaName, ...args);
    const get = fyo.db.get.bind(fyo.db);
    fyo.db.get = async (schemaName: string, name: string, ...args: any[]) => {
      if (schemaName === 'PurchaseInvoice' && name === invoice.name) {
        fixture.refreshes++;
        if (fixture.failRefresh) throw new Error('Invoice refresh rejected');
        const outstandingAmount = fixture.stored?.docstatus ? 0 : 100;
        return {
          ...invoice.getValidDict(),
          outstandingAmount: fyo.pesa(outstandingAmount),
        };
      }
      return get(schemaName, name, ...args);
    };

    fixture.openPayment = async () => {
      const action = fyo.models.PurchaseInvoice.getActions(fyo).find(
        (entry: any) => entry.label === 'Payment'
      );
      await action.action(invoice, router);
      fixture.payment = findOpenPayment(app._instance);
    };
    await router.push(`/edit/PurchaseInvoice/${invoice.name}`);

    /** The payment the quick edit shows, found in the component tree. */
    function findOpenPayment(root: any): any {
      const instances = [root];
      while (instances.length) {
        const instance = instances.pop();
        const doc = instance.setupState?.doc ?? instance.props?.doc;
        if (doc?.schemaName === 'Payment') return doc;
        const visit = (vnode: any) => {
          if (vnode?.component) instances.push(vnode.component);
          if (Array.isArray(vnode?.children)) vnode.children.forEach(visit);
        };
        visit(instance.subTree);
      }
    }
  });

  // Opening the form reloads the invoice; count only the payment's reloads.
  await expect(
    page.getByRole('heading', { name: 'PAYMENT-FLOW-INVOICE', exact: true })
  ).toBeVisible();
  await page.evaluate(() => {
    const fixture = (window as any).paymentFlow;
    fixture.refreshes = 0;
    return fixture.openPayment();
  });
  await expect
    .poll(() => page.evaluate(() => !!(window as any).paymentFlow.payment))
    .toBe(true);
}

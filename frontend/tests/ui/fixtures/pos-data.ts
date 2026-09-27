import { fyo } from 'src/initFyo';
import { models } from 'models';
import { FrappeDatabaseDemux } from 'src/web/databaseDemux';
import { getTestSchemas } from './schemas';

export const shift = { open: true };

export const products = [
  'Organic Assam Tea',
  'Roasted Arabica Coffee Beans',
  'Stoneware Coffee Mug',
  'Stainless Steel Tea Infuser',
  'Cotton Kitchen Towel',
  'Reusable Glass Water Bottle',
];

export async function preparePOSData() {
  const records: Record<string, any[]> = {
    PaymentMethod: [
      { name: 'Cash', type: 'Cash' },
      { name: 'Credit Card', type: 'Transfer' },
      { name: 'Bank Transfer', type: 'Transfer', requiresClearanceDate: true },
      { name: 'Store Cash', type: 'Cash' },
      { name: 'Store UPI', type: 'Transfer' },
    ],
    Item: products.map((name, index) => ({
      name,
      rate: String(240 + index * 135),
      unit: 'Unit',
      availableQty: 24 + index,
      hasBatch: false,
      hasSerialNumber: false,
    })),
    Party: [
      {
        name: 'Aarav Shah',
        role: 'Customer',
        loyaltyProgram: 'Store Rewards',
        loyaltyPoints: 1250,
      },
    ],
    PriceList: [{ name: 'Retail' }, { name: 'Members' }],
    Batch: [{ name: 'TEA-2026-09' }],
    POSOpeningShift: [
      {
        name: 'SHIFT-001',
        openingDate: '2026-09-06',
        openingCash: [10, 20, 50, 100, 200, 500].map((denomination) => ({
          denomination: String(denomination),
          count: 2,
        })),
        openingAmounts: ['Cash', 'Credit Card', 'Bank Transfer'].map(
          (paymentMethod) => ({ paymentMethod, amount: '0' })
        ),
      },
    ],
    SalesInvoice: Array.from({ length: 24 }, (_, index) => ({
      name: `SINV-2026-${String(index + 1).padStart(4, '0')}`,
      party: index % 2 ? 'Aarav Shah' : 'Meera Patel',
      date: '2026-09-06',
      grandTotal: '1250',
      outstandingAmount: '0',
      submitted: true,
      isPOS: true,
    })),
  };
  // The real schemas and models use an in-memory database for this fixture.
  FrappeDatabaseDemux.prototype.getSchemaMap = async () => getTestSchemas();
  FrappeDatabaseDemux.prototype.call = async (method, ...args) => {
    const [schema, name] = args as string[];
    if (method === 'getAll' || method === 'searchLink')
      return records[schema] ?? [];
    if (method === 'get')
      return records[schema]?.find((row) => row.name === name) ?? { name };
    if (method === 'getSingleValues') return [];
    if (method === 'exists') return true;
    if (method === 'count') return records[schema]?.length ?? 0;
    throw new Error(`Unexpected database write or call: ${method}`);
  };
  FrappeDatabaseDemux.prototype.runDocMethod = async () => ({});
  FrappeDatabaseDemux.prototype.callBespoke = async (method) => {
    if (method === 'getOpenPOSShift') return shift.open ? 'SHIFT-001' : null;
    if (method === 'getStockLocation') return null;
    if (method === 'getStockQuantities')
      return records.Item.map((item) => ({
        item: item.name,
        quantity: item.availableQty,
      }));
    return {};
  };
  await fyo.db.init();
  fyo.doc.registerModels(models);
  for (const schema of Object.values(fyo.schemaMap)) {
    if (schema?.isSingle) fyo.doc.getNewDoc(schema.name);
  }
  Object.assign(fyo.singles.AccountingSettings!, {
    enableInvoiceReturns: true,
    enableCouponCode: true,
    enablePriceList: true,
    enableItemEnquiry: true,
    enableLoyaltyProgram: true,
    enableDiscounting: true,
  });
  Object.assign(fyo.singles.POSSettings!, {
    posUI: 'Modern',
    canChangeRate: true,
    canEditDiscount: true,
  });
  Object.assign(fyo.singles.InventorySettings!, {
    enableUomConversions: false,
  });
  Object.assign(fyo.singles.Defaults!, {
    posCashDenominations: [1, 2, 5, 10, 20, 50, 100, 200, 500].map((value) => ({
      denomination: fyo.pesa(value),
    })),
    saveButtonColour: '',
    cancelButtonColour: '',
    heldButtonColour: '',
    returnButtonColour: '',
    payButtonColour: '',
  });
  for (const schema of ['Party', 'Item', 'PaymentMethod', 'POSOpeningShift']) {
    records[schema].forEach((row) => fyo.doc.getNewDoc(schema, row));
  }
  return records.Item.map((item) => ({
    ...item,
    rate: fyo.pesa(item.rate),
  }));
}

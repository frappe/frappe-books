import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import { getDocuments } from 'src/frappe/api';
import { safeParseFloat } from 'utils/index';

type UnitRow = {
  item?: string;
  unit?: string;
  transferUnit?: string;
};

type ItemUnits = {
  unit?: string;
  /** The factor of each of the item's other units, by unit. */
  factors: Record<string, number>;
};

/** The item's stock unit and the conversion factors of its other units. */
export async function getItemUnits(item: string): Promise<ItemUnits> {
  const [row] = await getDocuments('Books Item', {
    fields: ['unit', { uom_conversions: ['uom', 'conversion_factor'] }],
    filters: [['name', '=', item]],
  });
  const conversions = (row?.uom_conversions ?? []) as {
    uom: string;
    conversion_factor: number;
  }[];
  return {
    unit: row?.unit as string | undefined,
    factors: Object.fromEntries(
      conversions.map(({ uom, conversion_factor }) => [uom, conversion_factor])
    ),
  };
}

/** The item's conversion factor for the row's transfer unit, as the server derives it on save. */
export async function getUnitConversionFactor(row: UnitRow): Promise<number> {
  if (!row.item || !row.transferUnit || row.transferUnit === row.unit) {
    return 1;
  }

  const { factors } = await getItemUnits(row.item);
  return safeParseFloat(factors[row.transferUnit] ?? 1);
}

/** Rejects a transfer unit that is neither the item's stock unit nor one of its conversions. */
export async function validateTransferUnit(row: UnitRow, transferUnit: string) {
  if (!row.item || transferUnit === row.unit) {
    return;
  }

  const { factors } = await getItemUnits(row.item);
  if (!(transferUnit in factors)) {
    throw new ValidationError(
      t`Transfer Unit ${transferUnit} is not applicable for Item ${row.item}`
    );
  }
}

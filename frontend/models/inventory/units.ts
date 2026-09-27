import { Fyo, t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import { ModelNameEnum } from 'models/types';
import { safeParseFloat } from 'utils/index';

type UnitRow = {
  fyo: Fyo;
  item?: string;
  unit?: string;
  transferUnit?: string;
};

/** The item's conversion factor for the row's transfer unit, as the server derives it on save. */
export async function getUnitConversionFactor(row: UnitRow): Promise<number> {
  if (!row.item || !row.transferUnit || row.transferUnit === row.unit) {
    return 1;
  }

  const [conversion] = await row.fyo.db.getAll(
    ModelNameEnum.UOMConversionItem,
    {
      fields: ['conversionFactor'],
      filters: { parent: row.item, uom: row.transferUnit },
    }
  );
  return safeParseFloat(conversion?.conversionFactor ?? 1);
}

/** Rejects a transfer unit that is neither the item's stock unit nor one of its conversions. */
export async function validateTransferUnit(row: UnitRow, transferUnit: string) {
  if (!row.item || transferUnit === row.unit) {
    return;
  }

  const conversions = await row.fyo.db.getAll(ModelNameEnum.UOMConversionItem, {
    fields: ['parent'],
    filters: { parent: row.item, uom: transferUnit },
  });
  if (!conversions.length) {
    throw new ValidationError(
      t`Transfer Unit ${transferUnit} is not applicable for Item ${row.item}`
    );
  }
}

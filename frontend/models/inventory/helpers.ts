import { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { call } from 'src/web/api';

const AVAILABLE_SERIAL_NUMBERS =
  'frappe_books.frappe_books.doctype.books_serial_number.books_serial_number.get_available_serial_numbers';

/** The row's serial numbers resized to `quantity`, topped up with new ones from the item's series. */
export async function getSerialNumbersForQuantity(
  fyo: Fyo,
  item: string,
  serialNumber: string | undefined,
  quantity: number
): Promise<string> {
  if (!(await fyo.getValue(ModelNameEnum.Item, item, 'hasSerialNumber'))) {
    return '';
  }

  const current = (serialNumber ?? '')
    .split('\n')
    .map((serial) => serial.trim())
    .filter(Boolean);
  if (current.length >= quantity) {
    return current.slice(0, quantity).join('\n');
  }

  const added = await fyo.db.getNewSeriesNames(
    ModelNameEnum.SerialNumber,
    item,
    quantity - current.length
  );
  return [...current, ...added].join('\n');
}

/** The item's earliest received serial numbers in stock at the location, as the server picks them. */
export async function getAvailableSerialNumbers(
  fyo: Fyo,
  item: string,
  location: string | undefined,
  quantity: number
): Promise<string> {
  if (
    !location ||
    !quantity ||
    quantity <= 0 ||
    !(await fyo.getValue(ModelNameEnum.Item, item, 'hasSerialNumber'))
  ) {
    return '';
  }

  const serialNumbers = await call<string[]>(AVAILABLE_SERIAL_NUMBERS, {
    item,
    location,
    quantity,
  });
  return serialNumbers.join('\n');
}

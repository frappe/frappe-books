import { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { call } from 'src/web/api';

const AVAILABLE_SERIAL_NUMBERS =
  'frappe_books.frappe_books.doctype.books_serial_number.books_serial_number.get_available_serial_numbers';

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

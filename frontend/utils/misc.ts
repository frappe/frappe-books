import { DateTime } from 'luxon';
import countryInfo from '../fixtures/countryInfo.json';
import { CountryInfoMap } from './types';

export function getCountryInfo(): CountryInfoMap {
  // @ts-expect-error some countries have no fiscal year dates
  return countryInfo as CountryInfoMap;
}

export function getFiscalYear(
  date: string,
  isStart: boolean
): undefined | Date {
  if (!date) {
    return undefined;
  }

  const today = DateTime.local();
  const dateTime = DateTime.fromFormat(date, 'MM-dd');
  if (isStart) {
    return dateTime
      .plus({ year: [1, 2, 3].includes(today.month) ? -1 : 0 })
      .toJSDate();
  }

  return dateTime
    .plus({ year: [1, 2, 3].includes(today.month) ? 0 : 1 })
    .toJSDate();
}

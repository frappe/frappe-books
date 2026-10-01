import countryInfo from '../../frappe_books/data/country_info.json';
import { CountryInfoMap } from './types';

export function getCountryInfo(): CountryInfoMap {
  return countryInfo;
}

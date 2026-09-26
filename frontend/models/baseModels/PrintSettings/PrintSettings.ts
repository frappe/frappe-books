import { Doc } from 'fyo/model/doc';
import { HiddenMap } from 'fyo/model/types';

export class PrintSettings extends Doc {
  logo?: string;
  email?: string;
  phone?: string;
  address?: string;
  companyName?: string;
  color?: string;
  font?: string;
  displayLogo?: boolean;
  displayTime?: boolean;
  displayDescription?: boolean;
  displaytermsandconditions?: boolean;
  termsAndConditions?: string;
  posPrintWidth?: number;
  amountInWords?: boolean;
  override hidden: HiddenMap = {
    termsAndConditions: () => !this.displaytermsandconditions,
  };
}

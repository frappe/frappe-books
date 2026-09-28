import { BaseGSTR } from './BaseGSTR';
import { GSTRType } from './types';

export class GSTR2 extends BaseGSTR {
  static title = 'GSTR2';
  static reportName = 'gstr-2';
  static serverReportName = 'Books GSTR-2';

  gstrType: GSTRType = 'GSTR-2';
}

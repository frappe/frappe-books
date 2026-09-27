import { ModelMap } from 'fyo/model/types';
import NumberSeries from './NumberSeries';
import SystemSettings from './SystemSettings';
import { CustomField } from './CustomField';
import { CustomForm } from './CustomForm';

export const coreModels = {
  // Batch and serial-number series share the number series prefix rules.
  BatchSeries: NumberSeries,
  NumberSeries,
  SerialNumberSeries: NumberSeries,
  SystemSettings,
  CustomForm,
  CustomField,
} as ModelMap;

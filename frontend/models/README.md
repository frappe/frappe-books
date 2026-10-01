# Models

The `models` folder holds the model of each /books schema. A model extends `FrappeDoc` from `src/frappe/document.ts`, names its DocType in `static doctype`, and says how /books presents it: its label, quick edit fields, link filters, list settings, actions and the rules that depend on /books settings. The DocType meta gives the fields; the server fills and checks the values. See `docs/framework-backed-doctypes.md`.

A model can declare the fields it reads, for types:

```typescript
class Todo extends FrappeDoc {
  static override doctype = 'Books Todo';
  static override presentation = { label: 'Todo' };

  declare title?: string;
  declare date?: Date;
  declare completed?: boolean;
}
```

## Adding models

Register each model in `frappeModels` in `models/index.ts`, by its schema name. The search palette lists the schemas in that order. The rows of a table use the model the parent names in `static rowModels`, else a plain `FrappeDoc`.

Keep model modules independent from Vue and the global Fyo instance. Pass the Fyo instance to a model when the model needs it.

Use a dynamic import when a model action must open part of the interface.

## Regional Models

Regional models should as far as possible extend the base model and override what's required.

They should then be imported dynamically and returned from `getRegionalFrappeModels` in `models/index.ts` on the basis of `countryCode`.

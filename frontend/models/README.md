# Models

The `models` root folder contains all the model files, i.e. files containing all
the models. **Models** here, refers to the classes that handle the data, its
validation and updation and a bunch of other stuff.

Each model directly or indirectly extends the `Doc` class from
`fyo/model/doc.ts` so for more info check that file and the associated types
in `fyo/model/types.ts`.

A model class can used even if the class body has no content, for example
`PurchaseInvoiceItem`. Else the model used will default to using `Doc`. The
class can also be used to provide type information for the field types else they
default to the catch all `DocValue` example:

```typescript
class Todo extends Doc {
  title?: string;
  date?: Date;
  completed?: boolean;
}
```

While this has obvious advantages, the drawback is if the underlying fieldtype
changes this too will have to be changed.

The data stored by the models is decided by the schema passed to it's
constructor. Check `schemas/README.md` for info on this.

## Adding models

Keep model modules independent from Vue and the global Fyo instance. Pass the
Fyo instance to a model when the model needs it.

Use a dynamic import when a model action must open part of the interface.

## Regional Models

Regional models should as far as possible extend the base model and override
what's required.

They should then be imported dynamically and returned from
`getRegionalFrappeModels` in `models/index.ts` on the basis of `countryCode`.

# Fyo

`fyo` holds what every /books screen shares: translations (`t`, `T`), money (`pesa`), formatting, the user's rights, the open settings documents and the document events. Documents load and save through Frappe; see `docs/framework-backed-doctypes.md` and `src/frappe/`.

## The parts

| Part | Job |
| --- | --- |
| `index.ts` | The `Fyo` class. `src/initFyo.ts` makes the one instance that screens use. |
| `model/doc.ts` | `Doc`, the abstract document a form edits: values, unsaved edits, rights and the save lifecycle. `FrappeDoc` in `src/frappe/document.ts` loads and saves it through Frappe. |
| `model/types.ts` | The statics and dynamic rules a model sets (`hidden`, `readOnly`, `required`, `validations`, list settings, actions). |
| `utils/converter.ts` | A field's raw value to the value a form edits, and back. |
| `utils/format.ts` | How values show, by field type. |
| `utils/translation.ts` | Runtime translations. |

## Startup

`src/web/WebApp.vue` starts /books:

- Read the user, language and `country_code` from the Frappe boot.
- Register `frappeModels`, then the regional ones from `getRegionalFrappeModels` in `models/index.ts`.
- Set `fyo.store.permissions` with the models' doctypes (`getSchemaDoctypes`) and the boot's `can_*` lists.
- Call `loadFrappeDocTypes`, which loads every DocType meta in one request (`frappe_books.meta.get_books_meta`).
- Call `fyo.initializeMoneyMaker` with System Settings, then load the other singles into `fyo.singles` and the currency symbols.

## Translations

All translations take place during runtime. For translations to work, a `LanguageMap` (see `utils/types.ts`) has to be set with `setLanguageMapOnTranslationString` in `fyo/utils/translation.ts`.

Since translations are runtime, code evaluated before the language map loads is not translated. Do not keep translated strings in module-level constants.

## Document events

`fyo.observer` triggers the callbacks registered for an event of a schema, like `sync:SalesInvoice`, `submit:SalesInvoice`, `cancel:SalesInvoice` and `delete:SalesInvoice`. Lists and screens use them to refresh. The callbacks receive the document's name.

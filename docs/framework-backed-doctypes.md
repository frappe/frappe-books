# Frappe-backed doctypes in /books

The /books screens are moving off the camelCase bridge (`ui_api.database_call`, `schema_mapping.json`, `frontend/fyo/core`, `frontend/schemas`). A Frappe-backed doctype uses Frappe fieldnames from end to end. Its forms render from the DocType meta, and its documents load and save through `/api/v2`.

## The layer

`frontend/src/frappe/` holds the layer:

| File | Job |
| --- | --- |
| `doctypes.ts` | The switch. `registerFrappeModels` and `isFrappeBacked`. |
| `registry.ts` | Loads the meta at startup. `getSchema`, `getField`, `getFields`, `getModel` and `getSearchFields` answer for both kinds of schema. |
| `meta.ts` | `frappe.desk.form.load.getdoctype`, cached per doctype. Custom fields and property setters come with it. |
| `schema.ts` | Turns the meta into the schema that forms, tables and lists render. Breaks become tabs and sections. Permission levels make fields read only or hidden. |
| `document.ts` | `FrappeDoc`. It loads, inserts and saves the whole document, with `modified` so that Frappe refuses a stale copy. Submit, cancel and preview run as document methods on the client copy through `run_doc_method`. |
| `documents.ts` | The open documents, so that a form, a quick edit and a link share one. |
| `list.ts`, `link.ts` | List pages and counts over `/api/v2`, and link options from `search_link`. |
| `useBooksDoc.ts` | `useBooksDoc`, `newBooksDoc`, `getBooksDoc`: the one way screens get a document of either kind. |

A schema is Frappe-backed when its model is in `frappeModels` in `frontend/models/index.ts`. Everything else still uses the bridge. The schema name stays the route key, for example `Item` in `/edit/Item/Pen`. The model names the DocType.

## Where each part goes

| Part | Frappe-backed place |
| --- | --- |
| Fields, labels, placeholders, options, defaults, required, set once | The DocType JSON (`placeholder`, not `description`) |
| Help text under a field, status badge colours | The DocField `description`, the DocType `states` |
| Visibility, read only and required that depend on the document | `depends_on`, `read_only_depends_on`, `mandatory_depends_on` |
| Values the server fills (defaults, accounts, totals, fetched values) | A whitelisted controller method named in `static previewMethod`, for example `preview`. It fills values and does not save. `fetch_from` values come from `get_invalid_links()`. |
| Validation and business rules | The controller. A client mirror is only for a message at its field. |
| Link without "Create", Select option labels, a table's row form (`edit`) | `presentation.fields`, and `presentation.tables` for a table's rows |
| Table columns | `in_list_view` on the child DocFields |
| Label, name field of a prompt-named doctype (Data or AutoComplete), quick edit fields | `static presentation` on the model |
| Option labels, and Autocomplete values that are not options | `presentation.fields` |
| Rows of a table | The model registered for the row's schema in `frappeModels`, else `FrappeDoc` |
| Label, name field of a prompt-named doctype, quick edit fields, Select option labels, a list without Create, DocType fields /books neither shows nor saves | `static presentation` on the model (`label`, `nameField`, `quickEditFields`, `optionLabels`, `create`, `omitFields`) |
| Label, name field, quick edit fields, a link's display field, no Create on the list | `static presentation` on the model. A prompt asks for the name; another doctype shows it read only when `nameField` labels it. |
| Regional fields | A model that extends the base one, returned by `getRegionalFrappeModels` |
| Actions that open a mapped document | `getMappedDoc`; a Frappe-backed target runs through `frappe.model.mapper.make_mapped_doc` |
| Label, name field (asked for when named by prompt, else read only or `hidden`), quick edit fields | `static presentation` on the model |
| Field properties a DocField has no place for, like option labels or a link's `groupBy` | `presentation.fields` |
| Link filters and presentation of table rows | A row model in `static rowModels`, by table fieldname |
| Server fills that follow another field, like a payment account after its method | `static refills` on the model (the parent's or the row's) |
| List order | The DocType's `sort_field`, else `date` |
| List columns, badges, actions, option lists, formatting | The model statics, as before: `getListViewSettings`, `getActions`, `lists`, `emptyMessages` |
| Visibility that depends on /books settings | The model's `hidden` map |
| Link filters and create values | `static filters` and `static createFilters`, in the fieldnames of the target doctype |

A Frappe-backed single loads at startup under its doctype name. Its open document is `fyo.singles[schemaName]`, so every reader reads the same values, by Frappe fieldnames. Do not load it with `fyo.doc.getDoc`: that makes a second copy.

A doctype named by a field (`field:<fieldname>`, for example Books Account and Currency) shows that field as its name: the form asks for it on a new document and keeps it once saved.

A model for a Frappe-backed doctype extends `FrappeDoc`. It has no `formulas`, no `defaults` and no data code. When the user edits a field, the preview runs after a pause. A value that the preview filled is sent empty in the next preview, so the server fills it again. After the user edits that field, the server keeps the value of the user.
A model for a Frappe-backed doctype extends `FrappeDoc`. It has no `formulas`, no `defaults` and no data code. A new document previews when its form opens, and when the user edits a field, the preview runs after a pause. A value that the preview filled is sent empty in the next preview, so the server fills it again. After the user edits that field, the server keeps the value of the user, until the user edits a field that `refills` names for it. A save waits for the preview of the last edit. A server mapper's document (`getMappedDoc`) comes from `frappe.model.mapper.make_mapped_doc`.

## Move a module

1. Move each fill, default and rule of the model to the controller. Add a whitelisted `preview` if the form shows values that the server fills.
2. In the DocType JSON, move each placeholder from `description` to `placeholder`, and add the `depends_on` rules.
3. Rewrite the model: extend `FrappeDoc`, set `doctype`, `presentation` and `previewMethod`, and use Frappe fieldnames.
4. Move the model from `models` to `frappeModels`.
5. Find each link to the doctype (`grep '"options": "Books X"'` in the DocType JSON files). Change its `filters` and `createFilters` to Frappe fieldnames.
6. Change route filters for the lists of the doctype (`src/utils/filters.ts`, sidebar, Get Started) to Frappe fieldnames.
7. Change fieldnames that screens keep by schema name, for example in `mobileRowLayout.ts`.
8. Keep the entry in `schema_mapping.json` and the schema file while bridge code still reads the doctype (`fyo.getValue`, `fyo.doc.getDoc`, `fyo.db.getAll`). Remove them with the last reader.
9. Add node tests for the model and the form layout, and a Playwright spec for the screens.

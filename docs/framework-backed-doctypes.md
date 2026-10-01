# Frappe-backed doctypes in /books

Every /books screen is Frappe-backed: it uses Frappe fieldnames from end to end, its forms render from the DocType meta, and its documents load and save through `/api/v2`. Before phase 2, /books read and wrote through a camelCase bridge (`ui_api.database_call`, `schema_mapping.json`, `frontend/fyo/core`, `frontend/schemas`), which is gone.

## The layer

`frontend/src/frappe/` holds the layer:

| File | Job |
| --- | --- |
| `doctypes.ts` | The models and loaded doctypes by schema name: `registerFrappeModels`, `isFrappeBacked`, `getDocType`, `getDocTypes`. |
| `registry.ts` | Loads the meta at startup. `getSchema`, `getField`, `getFields`, `getModel`, `getSearchFields`, `getSingleSchemaNames`, `getSchemaDoctypes` and `toSchemaName`. Reloads a doctype after its Custom Form is saved. |
| `meta.ts` | `frappe_books.meta.get_books_meta`: in one request, what `frappe.desk.form.load.getdoctype` sends for every model's doctype and its tables, and where Books Custom Forms place custom fields. Custom fields and property setters come with the meta. |
| `fieldProperties.ts` | A DocField's type, options, default, required and minimum as the field /books renders. |
| `schema.ts` | Turns the meta and the model's `presentation` into the schema that forms, tables and lists render. Breaks become tabs and sections. Permission levels make fields read only or hidden. |
| `document.ts` | `FrappeDoc`. It loads, inserts and saves the whole document, with `modified` so that Frappe refuses a stale copy. Submit, cancel and preview run as document methods on the client copy through `run_doc_method`. |
| `documents.ts` | The open documents, so that a form, a quick edit and a link share one. A mapped document (`getMappedFrappeDoc`) comes from `frappe.model.mapper.make_mapped_doc`. |
| `api.ts` | `/api/v2` requests: documents, lists, counts and one field's value (`getValue`). `getAllDocuments` reads every row of a short list, like payment methods, through `frappe.client.get_list`. |
| `list.ts`, `link.ts` | List pages, counts and documents by name (`getFrappeRows`) over `/api/v2`. Link options from `search_link`, and the text a link shows (`getLinkDisplayValue`). |
| `values.ts` | Frappe values to form values and back. |
| `dependsOn.ts` | Evaluates `depends_on` conditions as Frappe forms do. |
| `useBooksDoc.ts` | `useBooksDoc`: a form's document with the user's rights on it (`frappe.client.get_doc_permissions`). Other screens use `newFrappeDoc`, `getFrappeDoc` and `getFrappeDocOrNew` from `documents.ts`. |

Each schema's model is in `frappeModels` in `frontend/models/index.ts`. The schema name stays the route key, for example `Item` in `/edit/Item/Pen`. The model names the DocType, and the boot permissions map each schema name to it. The rows of a table go by the table's DocType without `Books ` and spaces, for example `SalesInvoiceItem`. `getRegionalFrappeModels` gives the regional models, for example the Indian Party, which replace their `frappeModels` entries. A model can show a Frappe doctype that the app does not ship, like Currency, Country or Print Format; its `presentation` gives the labels, options and defaults that /books shows, and `omitFields` leaves out the rest.

## Where each part goes

| Part | Frappe-backed place |
| --- | --- |
| Fields, labels, placeholders, options, defaults, required, set once | The DocType JSON (`placeholder`, not `description`) |
| Help text under a field, status badge colours | The DocField `description`, the DocType `states` |
| Visibility, read only and required that depend on the document | `depends_on`, `read_only_depends_on`, `mandatory_depends_on`. The conditions read `docstatus`, and amounts as numbers. |
| Values the server fills (defaults, accounts, totals, fetched values) | A whitelisted controller method named in `static previewMethod`, for example `preview`. It fills values and does not save. `fetch_from` values come from `get_invalid_links()`. |
| Validation and business rules | The controller. A client mirror is only for a message at its field. |
| Label, quick edit fields, a list without Create (`create: false`), a link's display field (`linkDisplayField`) | `static presentation` on the model |
| The name field | `presentation.nameField`. A prompt-named doctype asks for the name, as Data or AutoComplete. Another doctype shows its name read only at the top of the form, or only labels it in lists when `hidden` is set. |
| Field properties that no DocField property says | `presentation.fields`, by fieldname: Select `optionLabels`, the `options` of a DocType reference, `allowCustom`, a link's `groupBy`, a table whose rows open in the row editor (`edit`), and a Link without Create (`create: false`, or `withoutCreate([...])`). A Link offers Create unless its presentation says not. |
| DocType fields that /books neither shows nor saves, and the values a new document gets for them | `presentation.omitFields`, `presentation.insertValues` |
| Table columns | `in_list_view` on the child DocFields, or `presentation.tableFields` on the row model when /books orders them differently |
| Rows of a table: their presentation, link filters, hidden fields | A row model, named in the parent's `static rowModels` by table fieldname. Other rows are plain `FrappeDoc`s. A child DocType has one row model, for example `TaxSummary` for invoices and payments. |
| Fields the server fills again after the user edits the field they follow, for example a payment account after its method | `static refills` on the model or the row model |
| Fields whose default the server decides, for example one that follows a setting | `static serverDefaults` |
| List columns, badges, actions, option lists, formatting | The model statics, as before: `getListViewSettings`, `getActions`, `lists`, `emptyMessages` |
| List order | The DocType's `sort_field`, else `date`, newest first |
| Visibility that depends on /books settings | The model's `hidden` map |
| Link filters and create values | `static filters` and `static createFilters`, in the fieldnames of the target doctype |
| Actions that open a mapped document | `getMappedDoc`. A Frappe-backed target runs through `frappe.model.mapper.make_mapped_doc`. |
| Rows a screen adds for the user, like a scanned item | Append the row, then `set` its item, so the `refills` of the item leave the price and details to the server. A row appended with its item sends an empty rate as 0, which the server keeps. |
| A cancel that also cancels linked documents | The controller's whitelisted `cancel_with_linked_docs` |

## How a document behaves

A model for a Frappe-backed doctype extends `FrappeDoc`. It has no `formulas`, no `defaults` and no data code.

A new document previews once when its form opens. When the user edits a field, the preview runs after a pause, and a save waits for the preview of the last edit. A value that the preview filled is sent empty in the next preview, so the server fills it again. After the user edits that field, the server keeps the value of the user, until the user edits a field that `refills` names for it. A model calls `leaveToServer` itself when the refill depends on the document, for example to price rows again. A document without a preview clears these fields, so its save sends them empty.

A value that the user entered and the server only corrected, such as the sign of a return quantity, stays the value of the user. Frappe sends no empty values, so a value that is missing from the preview is empty.

A document method gets the client copy with its `name`, `modified`, `docstatus`, `creation` and `owner`, because Frappe refuses a copy that changes them. An insert sends no name unless the doctype is named by the user.

The naming rule of the DocType decides how a new document is named. A doctype named by a field (`field:<fieldname>`, for example Books Account and Currency) shows that field as its name. The form asks for it on a new document and keeps it once saved. A doctype with a `number_series` field, or one that its controller names by script, gets a temporary name like `New Sales Invoice 01` until the server names it from the series.

A submittable list filters by Submitted and Cancelled, which become `docstatus` filters. The `name` of a server-named document is a list filter field.

A single loads at startup under its schema name. Its open document is `fyo.singles[schemaName]`, so every reader reads the same values, by Frappe fieldnames; `getFrappeDoc` returns the same open document. A value that another doctype keeps is a virtual field with a controller property, for example the System Settings currency, the Accounting Settings country and the Defaults print formats. A save never sets a virtual field: before frappe#43435, Frappe stored a single's virtual values, so a loaded copy held stale ones. A virtual field that /books edits has its own whitelisted method, which the model calls before it saves, for example `set_print_formats` for the Defaults print formats.

## Guards

These node tests catch common mistakes after a merge:

- `tests/settings-readers.test.mjs`: each `fyo.singles.X.field` read names a field of the Frappe-backed single.
- `tests/settings-models.test.mjs`: the filters, hidden, read-only and validation rules of each Frappe-backed model name fields of its DocType.
- `tests/link-create.test.mjs`: each Link of a form or row offers Create as it did before phase 2 (`tests/helpers/previousForms.mjs` keeps what the old schema files showed).

## Custom forms

A Books Custom Form is named after the DocType it adds fields to. Each row places one Custom Field, named `custom_books_` and the row's fieldname, on a tab and section of the /books form. The Custom Field holds the definition; a row's Target is a DocType and its References is a Frappe fieldname. `get_books_meta` sends the placements with the meta, and saving or deleting a Custom Form reloads the doctypes that show or hold the customized one.

## Add a doctype to /books

1. Put each fill, default and rule in the controller.
2. If the form shows values that the server fills, add a whitelisted `preview`.
3. In the DocType JSON, set each `placeholder`, and the `depends_on` rules.
4. Write the model: extend `FrappeDoc`, set `doctype`, `presentation` and `previewMethod`, and use Frappe fieldnames.
5. Give each table that needs one a row model in `rowModels`.
6. Register the model in `frappeModels`.
7. Find each link to the doctype (`grep '"options": "Books X"'` in the DocType JSON files). Set its `filters` and `createFilters` in Frappe fieldnames.
8. Add route filters for the lists of the doctype (`src/utils/filters.ts`, sidebar, Get Started) in Frappe fieldnames.
9. Add node tests for the model and the form layout, and a Playwright spec for the screens.
10. Run the guards.

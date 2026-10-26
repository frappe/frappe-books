# Form scripts for /books

Desk runs an app's `doctype_js`. /books does not, because it has its own client. An app that wants its form behaviour in /books adds a form script with the `books_doctype_js` hook.

## The hook

In the app's `hooks.py`, by doctype, as `doctype_js`:

```python
books_doctype_js = {
	"Sales Invoice": "public/js/books/sales_invoice.js",
}
```

The key is the doctype the form shows. With ERPNext installed, that is the ERPNext doctype, for example `Sales Invoice`. Without ERPNext, it is the Books doctype, for example `Books Sales Invoice`.

Books reads the files with Frappe's own `get_code_files_via_hooks` and `get_js`, so `{% include %}` works. They come with the form meta (`frappe_books.meta.get_books_meta`) and run once, when a form of the doctype first opens.

## The API

A script registers handlers as on Desk:

```js
books.ui.form.on("Sales Invoice", {
	setup(frm) {
		frm.set_query("customer_address", (doc) => ({
			query: "frappe.contacts.doctype.address.address.address_query",
			filters: { link_doctype: "Customer", link_name: doc.customer },
		}));
		frm.set_query("income_account", "items", (doc, cdt, cdn) => ({
			filters: { company: doc.company, item: locals[cdt][cdn].item_code },
		}));
	},
	refresh(frm) {},
	customer(frm) {},
});

books.ui.form.on("Sales Invoice Item", {
	item_code(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
	},
});
```

| Name | What it does |
| --- | --- |
| `books.ui.form.on(doctype, handlers)` | Registers handlers. Register a row's handlers under the row's doctype. |
| `setup(frm)` | Runs once per document, when its form opens. |
| `refresh(frm)` | Runs when a form first opens the document, and after each save or submit. |
| `<fieldname>(frm)` | Runs after the field changes. A row's field handler gets `(frm, cdt, cdn)`. |
| `frm.doc` | The document's current values. Read only. |
| `frm.set_query(fieldname, getQuery)` | A Link's search, as on Desk: `{ query, filters }`, or a function of `(doc, cdt, cdn)` that returns it. Use `(fieldname, table, getQuery)` for a row's field. |
| `frm.set_value(fieldname, value)` | Sets a value of the document. |
| `books.model.set_value(cdt, cdn, fieldname, value)` | Sets a value of a row. |
| `locals[cdt][cdn]` | A row's current values, as on Desk. |

A Link searches with the script's `set_query` first. With ERPNext installed, the DocField's `link_filters` then apply over it, as on Desk. Without either, the field searches with the Books model's filters.

The server still checks every value. A form script only shapes what the form offers.

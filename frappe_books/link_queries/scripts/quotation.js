books.ui.form.on("Quotation", {
	setup(frm) {
		set_transaction_queries(frm);
		frm.set_query("item_code", "items", (doc) => sales_item_query(frm.doctype, doc));
	},
});

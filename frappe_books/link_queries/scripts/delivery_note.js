books.ui.form.on("Delivery Note", {
	setup(frm) {
		set_transaction_queries(frm);
		frm.set_query("warehouse", "items", (doc, cdt, cdn) => row_warehouse_query(doc, locals[cdt][cdn]));
	},
});

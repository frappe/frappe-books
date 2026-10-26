books.ui.form.on("Purchase Invoice", {
	setup(frm) {
		set_transaction_queries(frm);
		frm.set_query("item_code", "items", purchase_item_query);
	},
});

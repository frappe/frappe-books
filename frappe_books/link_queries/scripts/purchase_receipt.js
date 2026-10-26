books.ui.form.on("Purchase Receipt", {
	setup(frm) {
		frm.set_query("item_code", "items", purchase_item_query);
	},
});

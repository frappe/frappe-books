// ERPNext's link queries that branch on the document's values, which /books
// cannot generate from Desk JS (see ../generate.mjs). Each is ERPNext's, as
// the function it names has it; the nightly check compares them with Desk's.

/** erpnext.get_currency */
function get_currency(company) {
	const boot = books.boot;
	const found = boot.docs?.find((doc) => doc.doctype === ":Company" && doc.name === company);
	return found?.default_currency || boot.sysdefaults.currency;
}

/** erpnext.TransactionController.set_query_for_batch */
function batch_query(doctype, doc, row) {
	if (doctype === "Purchase Receipt" || (doctype === "Purchase Invoice" && doc.update_stock)) {
		return { filters: { item: row.item_code } };
	}

	const filters = {
		item_code: row.item_code,
		posting_date: doc.posting_date || books.datetime.nowdate(),
	};
	if (doc.is_return) {
		filters.is_return = 1;
		if (["Sales Invoice", "Delivery Note"].includes(doctype)) {
			filters.is_inward = 1;
		}
	}
	if (row.warehouse) {
		filters.warehouse = row.warehouse;
	}
	return { query: "erpnext.controllers.queries.get_batch_no", filters };
}

/** erpnext.TransactionController.set_query_for_item_tax_template */
function item_tax_template_query(doc, row) {
	if (!row.item_code) {
		return doc.company ? { filters: { company: doc.company } } : {};
	}

	const filters = {
		item_code: row.item_code,
		valid_from: ["<=", doc.transaction_date || doc.bill_date || doc.posting_date],
		item_group: row.item_group,
		base_net_rate: row.base_net_rate,
		disabled: 0,
	};
	if (doc.tax_category) {
		filters.tax_category = doc.tax_category;
	}
	if (doc.company) {
		filters.company = doc.company;
	}
	return { query: "erpnext.controllers.queries.get_tax_template", filters };
}

/** The item_code query of erpnext.buying.BuyingController.setup_queries */
function purchase_item_query(doc) {
	const filters = doc.is_subcontracted
		? { supplier: doc.supplier, company: doc.company, is_stock_item: 0 }
		: { supplier: doc.supplier, is_purchase_item: 1, has_variants: 0, company: doc.company };
	return { query: "erpnext.controllers.queries.item_query", filters };
}

/** The item_code query of erpnext.selling.SellingController.setup_queries */
function sales_item_query(doctype, doc) {
	const customer =
		doctype === "Quotation" && doc.quotation_to === "Customer" ? doc.party_name : doc.customer;
	return {
		query: "erpnext.controllers.queries.item_query",
		filters: { is_sales_item: 1, customer, has_variants: 0, company: doc.company },
	};
}

/** The row query of erpnext.queries.setup_warehouse_query */
function row_warehouse_query(doc, row) {
	const query = {
		filters: [
			["Warehouse", "company", "in", ["", doc.company || ""]],
			["Warehouse", "is_group", "=", 0],
		],
	};
	if (row.item_code) {
		query.query = "erpnext.controllers.queries.warehouse_query";
		query.filters.push(["Bin", "item_code", "=", row.item_code]);
	}
	return query;
}

/** A transaction's row queries of erpnext.TransactionController */
function set_transaction_queries(frm) {
	frm.set_query("batch_no", "items", (doc, cdt, cdn) => batch_query(frm.doctype, doc, locals[cdt][cdn]));
	frm.set_query("item_tax_template", "items", (doc, cdt, cdn) =>
		item_tax_template_query(doc, locals[cdt][cdn])
	);
}

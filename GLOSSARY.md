# Frappe Books

Frappe Books is small-business accounting, inventory and point of sale on Frappe Framework, used through the /books app.

## Invoicing

**Invoice kind**:
Whether an invoice is a sale, a purchase or a quote, which decides its party role, ledger account type, item account and posting side.
_Avoid_: transaction type

**Return**:
A credit note or debit note that takes back at most what its original invoice sold or bought of each item and batch, and only serial numbers no earlier return took back.
_Avoid_: refund invoice, reversal

**Settlement**:
Applying payments to an invoice's outstanding amount, where a return counts as negative.
_Avoid_: reconciliation, allocation

**Due**:
The positive amount still to pay on an invoice, or still to refund on a return.
_Avoid_: balance, outstanding (for the unsigned amount)

## Inventory

**Stock transfer**:
A Shipment or Purchase Receipt: the document that moves an invoice's stock out of or into a location.
_Avoid_: delivery note, goods receipt

**Automatic transfer**:
The stock transfer an invoice makes when it is submitted, for the stock no transfer it bills has moved.

**Stock unit**:
The unit an item's stock is counted in; a row may sell or buy it in another, its transfer unit.
_Avoid_: base unit, UOM

**Invoice–transfer link**:
An invoice and the stock transfer that moves its stock, either the one it bills or the one made automatically when it is submitted.

**Stock posting**:
A transfer's stock ledger entries, their FIFO costs and the general ledger entries for them, including the later entries they restate.
_Avoid_: stock entry

## Point of sale

**POS shift**:
The period a cashier works the counter, opened with counted cash and closed with counted cash.
_Avoid_: session, register

**Cash method**:
A payment method of the Cash type; the counted drawer covers all of them.

**Cart**:
The rows of a POS sale and the rules for changing them: one quantity unit, the stock check and the serial numbers each row needs.
_Avoid_: order, selected items

**Tender**:
What the cashier takes for a POS sale: payment method, amount, reference and clearance date.
_Avoid_: payment details

**POS checkout**:
Paying for a POS sale with its tender and submitting it, or paying the rest of a submitted sale.
_Avoid_: transaction

## Documents

**Preview**:
The server filling a document's values from its unsaved copy, without saving it.
_Avoid_: calculate, dry run

**Mapped document**:
A new, unsaved document that a server mapper builds from a saved document of another doctype, like a payment from an invoice.
_Avoid_: converted document, copy

**Field state**:
Whether a field is hidden, read only or required on a document right now.

**Missing field**:
A required field that is empty, which the form marks and the save refuses.
_Avoid_: mandatory error

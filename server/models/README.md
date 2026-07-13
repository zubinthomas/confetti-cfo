# Data model

Covers all three source workbooks:

- `Cafe_Weekly_P_L_-_2025_-2026.xlsx`
- `CEPL_P___L_2025-26.xlsx`
- `Sienna_Store_Sales_Analysis_FINAL.xlsx`

## Tables and what they replace

| Model              | Replaces / represents                                                             |
|---------------------|-------------------------------------------------------------------------------------|
| `Business`           | Top-level company/venue: Cafe, CEPL, Sienna                                        |
| `BusinessUnit`       | A P&L sheet/department (F&B, Store, Pottery, Batik, Stitching...) or a physical store/outlet (HP Store, JP Store, Factory Outlet) |
| `Period`             | A reporting period — weekly, monthly, or a named event window (e.g. "Durga Puja 2025") |
| `LineItem`           | A named P&L row (e.g. "Raw Material", "HR Cost", "Site Cost Percentage"), with a `parentLineItemId` for subtotal rollups and `relatedAmountLineItemId` linking a "% of sales" row to its amount row |
| `FinancialRecord`    | Fact table: one (businessUnit, period, lineItem) → value. This is the P&L data from the Cafe and CEPL files |
| `Category`           | Product category for Sienna sales (Pottery, Textile, Jewellery, Horn & Wood...)     |
| `Channel`            | Sales channel for Sienna (HP Store, JP Store, Online, Corporate, Factory Outlet)    |
| `SalesRecord`        | Fact table: one (period, category, channel) → amount. Covers the "Overall sales" / "Category wise" / "Category Comparison" sheets |
| `Vendor`             | A consignment vendor/artisan and their commission rate                             |
| `ConsignmentRecord`  | Fact table: one (period, vendor) → amount, with the commission rate that applied   |

## Why this shape (not one-column-per-line-item)

The source sheets are "wide": each P&L line item is a row, each month/week is a column.
That layout doesn't hold up as a schema because the set of line items differs across
sheets (F&B has "Perishable Goods", Store doesn't) and grows over time. Modeling line
items as *data* (rows in `LineItem`) rather than *schema* (columns) means:

- new line items or categories don't require a migration
- `FinancialRecord` / `SalesRecord` stay in a normalized "long" format, which is what
  you want for SQL aggregation (`GROUP BY periodId`, `SUM(value)`, month-over-month
  comparisons, etc.)
- you can still reconstruct the original wide P&L view with a pivot query or a
  `GROUP BY period, businessUnit` + conditional aggregation in the application layer

## Notes on specific quirks handled

- **Amount/percentage pairs**: many P&L rows are immediately followed by a "% of sales"
  row (e.g. `COGS Percentage`, `HR Cost Percentage`). These become two `LineItem` rows
  (`valueType: 'amount'` and `valueType: 'percentage'`), linked via
  `relatedAmountLineItemId`, rather than two columns on one row — some percentage
  rows in the sheets don't have a matching amount label close by, so keeping them
  as independent records is safer than assuming a rigid 1:1 pairing.
- **Weekly vs monthly periods**: the Cafe file has both weekly tabs and monthly
  summary tabs covering overlapping dates. `Period.periodType` distinguishes these
  so aggregating weeks into months (or vice versa) is a query, not a data conflict.
- **Special event periods** (e.g. "Durga Puja 2025") are flagged via
  `Period.isSpecialEvent` rather than forced into the regular week sequence.
- **Consignment commission rate drift**: `Vendor.commissionRate` holds the vendor's
  current/typical rate, but `ConsignmentRecord.commissionRate` captures what was
  actually in effect for that period, since rates can change over time.

## Example queries you'd run against this

```js
// Monthly F&B revenue trend
await FinancialRecord.findAll({
  include: [
    { model: LineItem, as: 'lineItem', where: { name: 'Total F&B Sales Monthwise' } },
    { model: Period, as: 'period' },
  ],
  order: [[{ model: Period, as: 'period' }, 'startDate', 'ASC']],
});

// Sienna sales by category for a given month
await SalesRecord.findAll({
  include: [
    { model: Category, as: 'category' },
    { model: Period, as: 'period', where: { label: 'April 2026' } },
  ],
});
```

// queries.mjs - the ONLY DAX the wall's figures job may run. Kept on the server; callers can never send DAX.
// The analyst fills the placeholders (everything between << and >>). While any placeholder is left,
// the job refuses to run (reason NOT_CONFIGURED) and screens keep "No data for these dates".
//
// Each entry:
//   id      unique name for logs
//   page    wall page id (lower case, digits, dash), matches wallpages/<page>.json "figuresPage"
//   shape   "row"   -> exactly one row; each column becomes one figure
//           "table" -> up to maxRows rows, stored as one figure (an array) under `figure`
//   dax     one EVALUATE statement, ideally ROW(...) over the department cards' existing data measures
//   columns exact column names as Power BI returns them, e.g. "[Patients seen]"
//           -> {key, type: "int" | "num" | "label", min, max, values?: [allowed labels], nullable?}
// Rules (also enforced in code): no name, contact, case-number or free-text columns; labels at most 40 chars.

export const QUERIES = [
  {
    id: "<<query id, e.g. fm-today>>",
    page: "<<page id, e.g. fm>>",
    shape: "row",
    dax: "<<EVALUATE ROW(\"Patients seen\", [<<existing data measure>>], ...)>>",
    columns: {
      "[<<column>>]": { key: "<<figureKey>>", type: "int", min: 0, max: 1000000 },
    },
  },
];

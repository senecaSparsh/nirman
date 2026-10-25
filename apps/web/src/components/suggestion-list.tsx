/**
 * SuggestionList — a native <datalist> for free-text fields where users
 * re-type the same values (trades, designations). Typing shows matching
 * suggestions; picking one avoids spelling variants that corrupt
 * group-by reports ("Mason" vs "Masonry" vs "masonary").
 *
 * Usage:
 *   <Input list="suggest-trades" ... />
 *   <SuggestionList id="suggest-trades" options={COMMON_TRADES} />
 *
 * To merge company-specific values, pass
 *   options={[...new Set([...COMMON_TRADES, ...existing])]}
 */

export const COMMON_TRADES = [
  "Mason",
  "Carpenter",
  "Electrician",
  "Plumber",
  "Bar Bender",
  "Painter",
  "Welder",
  "Tiles / Marble Worker",
  "POP / False Ceiling",
  "Scaffolder",
  "Fitter",
  "Fabricator",
  "Waterproofing Worker",
  "Aluminium / Glazier",
  "Driver / Operator",
  "Gardener",
  "Helper / Labour",
  "Foreman",
  "Supervisor",
];

export const COMMON_DESIGNATIONS = [
  "Project Manager",
  "Site In-charge",
  "Site Engineer",
  "Junior Engineer",
  "Billing Engineer",
  "Planning Engineer",
  "QA/QC Engineer",
  "Quantity Surveyor",
  "Site Supervisor",
  "Foreman",
  "Safety Officer",
  "Store Keeper",
  "Accountant",
  "Purchase Executive",
  "HR Executive",
  "Office Assistant",
  "Driver",
  "Security Guard",
  "Watchman",
  "Helper",
];

export const COMMON_DEPARTMENTS = [
  "Site Operations",
  "Procurement",
  "Stores",
  "Accounts & Finance",
  "HR & Admin",
  "Sales & Marketing",
  "Estimation & Billing",
  "Quality",
  "Safety",
  "Planning",
  "Legal & Liaison",
  "Management",
];

export function SuggestionList({ id, options }: { id: string; options: string[] }) {
  return (
    <datalist id={id}>
      {options.map((o) => (
        <option key={o} value={o} />
      ))}
    </datalist>
  );
}

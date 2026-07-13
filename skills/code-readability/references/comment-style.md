# TSDoc house style

The standard the skill enforces, for any React + TypeScript codebase (it was tuned in a React 19 + TypeScript + MUI project). Every rule serves the four readers: human, IDE, doc generator, AI. The code samples below are illustrative — they come from the reference project (a residential-care menu app) to show the *shape* of a good comment; substitute your own symbols and domain.

## Why TSDoc, not PropTypes

In a TypeScript codebase, the component's prop `interface` **is** the contract — the compiler enforces it, the IDE autocompletes it, and `react-docgen-typescript` reads it. `PropTypes` would:
- duplicate the type (two sources of truth that drift),
- only check at runtime (the compiler already checks at build),
- add a dependency + bundle weight,
- and *not* improve IDE hovers or doc generation.

So: describe props with **TSDoc on the type members**. That single comment drives the IDE quick-info, the generated Wiki props table, and AI context.

## The four comment kinds

1. **Module header** — top-of-file `//` block: what this module is for and how its pieces fit. Keep this style where the codebase already uses it.
2. **TSDoc summary** — `/** */` immediately above an exported symbol. First sentence is a standalone noun-phrase.
3. **Member docs** — `/** */` on each prop / interface field.
4. **Inline "why" notes** — `//` at a non-obvious line, explaining intent/trade-off. These are the highest-value comments and the best AI context; preserve and upgrade them. TSDoc complements them.

## Tags to use (and skip)

Use when they add information beyond the signature:
`@param` · `@returns` · `@example` · `@remarks` · `@see` · `@throws` · `@defaultValue` · `@deprecated`

Skip ceremony that restates types: don't write `@param x {string}` — the type is already in the signature. Don't `@returns void`.

`@example` blocks are fenced ` ```tsx ` and use **real** prop/import names so they compile in spirit and copy-paste cleanly.

---

## Patterns

### Component

```tsx
/**
 * A single meal's prep block: the recipe heading, its prep instructions, and
 * the ingredient list (sub-assembly groups + loose leaves). Used by Overnight
 * Prep; the Ingredients section hides itself when every item is diverted to the
 * stock check.
 *
 * @example
 * ```tsx
 * <MealPrepBlock slot={slot} onEdit={isAdmin ? () => nav(`/food-items/${id}`) : null} />
 * ```
 * @remarks Renders nothing for the ingredient list when `slot.subAssemblies`
 * are all empty — intentional, so an all-"stock check only" recipe shows just
 * its instructions.
 */
export function MealPrepBlock({ slot, onEdit }: MealPrepBlockProps) { … }

interface MealPrepBlockProps {
  /** The resolved prep-detail slot (recipe + expanded ingredients) to render. */
  slot: PrepMealSlot;
  /** Admin-only jump to the recipe editor; `null` hides the edit affordance. */
  onEdit: (() => void) | null;
}
```

Prefer a **named props interface** over an inline object type when a component has more than ~2 props — react-docgen-typescript and IDE refactors both handle it better, and each prop gets its own documented line.

> **Placement matters.** The component summary `/** */` goes **directly above the
> component**, *not* above its `Props` interface. `react-docgen-typescript` (and
> the IDE hover on `<Component>`) read the description from the component's own
> leading JSDoc; a block placed above `Props` documents the *type*, not the
> component, and is **dropped** from the generated docs. Put per-prop `/** */` on
> the `Props` members and the summary + `@example` on the component.

### Hook — document the returned shape

A hook's value is its return object; document each field, because that's what callers destructure and what the IDE shows.

```ts
/**
 * Loads the stocking catalog + checks + locations for `date` and derives the
 * sorted / grouped / filtered row set for the Stock Check panel.
 *
 * @param date - ISO `YYYY-MM-DD` whose checks are shown.
 * @param extraItems - Verify-only staples diverted from the day's prep (#247),
 *   merged into the list and deduped by id.
 * @returns Render-ready state + actions:
 *  - `loading` / `error` — fetch status.
 *  - `visibleRows` — rows after sort + location filter (flat view).
 *  - `grouped` — `Map<groupKey, Row[]>` for the grouped view, or `null` when
 *    `groupBy === 'none'`.
 *  - `handleSort(col)` — cycles a column asc → desc → off.
 *  - `toggle(item)` — flips today's check and refetches just the checks.
 * @example
 * ```ts
 * const { loading, grouped, visibleRows, toggle } = useStockCheckRows(date, extraItems);
 * ```
 */
export function useStockCheckRows(date: string, extraItems: StockCheckOnlyItem[]) { … }
```

### Pure function

```ts
/**
 * Format a quantity for the kitchen: common fractions as glyphs (½, ¼, …) so
 * staff read "½ cup" instead of "0.5 cup". Always appends the unit.
 *
 * @param n - Quantity (already scaled).
 * @param unit - Unit label; `''` yields just the number.
 * @returns e.g. `"1 ¼ tsp"`, `"½ cup"`, `"3 ea"`.
 * @example formatQty(1.25, 'tsp') // "1 ¼ tsp"
 */
export function formatQty(n: number, unit: string): string { … }
```

### Type / interface

```ts
/** One verify-only staple pulled out of the day's prep instructions (#247). */
export interface StockCheckOnlyItem {
  /** food_items.id of the staple. */
  foodItemId: string;
  /** Display name shown in the Stock Check checklist. */
  name: string;
  /** Scaled total across the day's recipes (reference only). */
  quantity: number;
  /** Unit of `quantity`. */
  unit: string;
}
```

---

## The AI-context test

Before moving on, ask: **could a competent model use this symbol correctly from the comment alone** — without reading the body? If the comment omits an invariant, a gotcha, or where the source of truth lives, add it. High-value AI context names the project-specific invariant a model couldn't guess — e.g. (illustrative, from the reference project):
- "Stock-check-only items are excluded upstream, so they never appear here."
- "`source IN ('auto-group','sub-assembly')` marks structural groupings (now removed from prod) — flatten by the dual-flag instead."
- "Quantities are in the recipe unit; the purchase list converts to pack units."

Substitute the equivalent invariants from your own domain.

## Anti-patterns

| Bad | Why |
|---|---|
| `// the user's name` over `name` | restates the obvious |
| `@param date {string} the date` | repeats the type; says nothing |
| `PropTypes.shape({...})` | duplicates the TS interface |
| Deleting a "why" note to add a bland summary | loses the highest-value comment |
| `@example` with invented prop names | won't compile, misleads |
| A 5-line TSDoc on a one-line private helper | ceremony; document exports, not everything |

## Voice

Match the file. Mirror the surrounding code's tone and density — if its comments are terse, intent-first, and use arrows (→) and em dashes freely, do the same. Honor project conventions in `CLAUDE.md`/`AGENTS.md`, but note that a prose style rule (e.g. "no em dashes") often targets **user-facing copy**, not code comments — when in doubt, match the file you're editing.

---

## Beyond TypeScript: HTML, CSS, and vanilla JS

The standard above is TSDoc-centric because the primary target is React + TypeScript + MUI (where styling is the MUI `sx` prop, not stylesheets). For projects — or parts of one — that ship hand-written **HTML, CSS/Sass, or vanilla JS**, apply the equivalent so the four-readers principle still holds. The AI-context test applies to all three: *could a model use this correctly from the comment/structure alone?*

### Vanilla JavaScript → JSDoc
Same shape as TSDoc, but the **types live in the comment** (there's no compiler to read them): `@param {string} name`, `@returns {Promise<User>}`, `@typedef`. JSDoc is machine-readable — IDEs surface it on hover, `tsc --checkJs` type-checks it, and the `jsdoc` / `documentation.js` CLIs generate an HTML site ([JSDoc best practices](https://www.pullrequest.com/blog/leveraging-jsdoc-for-better-code-documentation-in-javascript/)).
```js
/**
 * Debounce a function: call `fn` at most once per `waitMs`, on the trailing edge.
 * @param {Function} fn - the function to debounce.
 * @param {number} waitMs - quiet period before firing.
 * @returns {Function} the debounced wrapper.
 * @example const onResize = debounce(layout, 150);
 */
```

### CSS / Sass → KSS or SassDoc
CSS has no symbols to hover, so document **intent + the component/section a rule cluster styles**, and prefer a *living style guide* (the docs render the actual UI, so they can't drift):
- **Section/block comments** explain the *why* of a rule cluster — the layout strategy, the breakpoint, a magic number — not the obvious (`/* red */` is noise).
- **KSS** (`// Styleguide` blocks, [kss-node](https://github.com/kss-node/kss-node)) documents a UI component + its states/modifiers and generates a living style guide; Sass → **SassDoc** (`///` on mixins/functions/variables) generates a design-system API reference.
- Name by intent (`--space-md`, `.card--featured`), keep specificity flat, and group/comment by component so a reader (or AI) can find the rule that owns a piece of UI ([programmatically documenting CSS](https://css-tricks.com/options-programmatically-documenting-css/)).

### HTML → semantic structure *is* the documentation
Well-structured HTML is self-documenting; that's its readability story ([semantic HTML / web.dev](https://web.dev/learn/html/semantic-html/)):
- Use **semantic elements** (`<nav>`, `<main>`, `<header>`, `<form>`, `<label>`, `<button>`) over `<div>` soup — the tag names tell a human, a browser, a screen reader, *and* an AI what each region is.
- **Accessibility = readability**: `<label for>`, `alt`, descriptive link text (never "click here"), `lang`, and ARIA only to fill gaps semantics can't.
- Comment non-obvious structure (`<!-- skip-link target for keyboard nav -->`); for web components, JSDoc + the Custom Elements Manifest generate the API.

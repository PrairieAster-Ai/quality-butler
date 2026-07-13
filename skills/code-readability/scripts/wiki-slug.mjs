// Canonical GitHub heading-anchor slug for wiki page generators.
//
// MUST match `github-slugger` (what GitHub/Gollum use to assign `id`s to
// headings), so generated `[text](#anchor)` jump links resolve. The gotcha that
// bit us: it KEEPS word characters, *including the underscore* — `### my_table`
// becomes `#my_table`, NOT `#mytable`. A naive `[^a-z0-9]` filter strips the
// underscore and silently breaks jump-nav for every snake_case heading (caught
// only by rendering the schema page through GitHub's Markdown API).
//
// Rules: lowercase · drop punctuation that is NOT a word char / whitespace /
// hyphen · each remaining whitespace char → one hyphen (no collapsing, matching
// github-slugger).
//
//   ghSlug('my_table')              -> 'my_table'
//   ghSlug('order_line_items')      -> 'order_line_items'
//   ghSlug('MyComponent')           -> 'mycomponent'
//   ghSlug('Buttons & Inputs')      -> 'buttons--inputs'
//
// Always use this for wiki anchors — never re-implement it inline.
export function ghSlug(text) {
  return String(text).toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s/g, '-');
}

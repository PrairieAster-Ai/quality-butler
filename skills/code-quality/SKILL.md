---
name: code-quality
description: Assess and improve code quality in TypeScript/React projects. Runs lint, type-check, coverage, duplication, and complexity analysis with sprint planning.
allowed-tools: "Bash(npm:*),Bash(npx:*),Read,Write,Edit,Grep,Glob"
---

# Code Quality Assessment & Improvement Skill

Systematic code quality analysis, metric tracking, and improvement sprint planning for TypeScript/React projects.

> **How this relates to `code-health`.** In the quality-steward bundle, `code-health` owns the
> structural roll-up (Maintainability Index, coupling, hotspots) and the graded dashboard, and
> already folds in coverage and lint signals. `code-quality` is the **hands-on improvement** side:
> lint/type-check/coverage runs plus **sprint planning** to act on the findings. Some measures
> overlap (both can compute complexity/duplication) — reach for `code-health` for the *score and
> trend*, and `code-quality` when you're *planning and doing* the cleanup.

## Quick Commands

- `/code-quality assess` - Run full assessment and generate report
- `/code-quality metrics` - Show current metrics vs targets
- `/code-quality hotspots` - Identify highest-priority improvement areas
- `/code-quality sprint` - Plan a focused improvement sprint

## Workflow

### Phase 1: Assessment

Run comprehensive code quality checks and establish baseline metrics.

**Required Checks:**

1. **Lint Analysis**
   ```bash
   npm run lint
   ```
   - Target: 0 errors, 0 warnings
   - Track: Total warnings by category

2. **Type Safety**
   ```bash
   npm run type-check
   ```
   - Target: 0 TypeScript errors
   - Track: Error count and locations

3. **Test Coverage**
   ```bash
   npx vitest run --coverage
   ```
   - Target: 80%+ line coverage
   - Track: Coverage by directory

4. **Code Duplication**
   ```bash
   npx jscpd src --reporters json --output duplication-report
   ```
   - Target: <2% duplication
   - Track: Percentage and clone locations

5. **`any` Type Count**
   Use the **Grep** tool with pattern `: any` on `src/`, glob `*.{ts,tsx}`, output_mode `count`. Exclude test files by filtering results.
   - Target: <50 `any` types
   - Track: Count by file

6. **Large File Detection**
   Use the **Glob** tool with pattern `src/**/*.{ts,tsx}`, then **Read** each file to check line count. Sort results by size.
   - Target: No files >500 lines (excluding data files)
   - Track: Files exceeding threshold

7. **Complexity Analysis** (if eslint-plugin-complexity configured)
   ```bash
   npx eslint src --rule 'complexity: [warn, 15]'
   ```
   - Target: No functions with complexity >15
   - Track: High-complexity function locations

### Phase 2: Hotspot Identification

Prioritize issues using the **Impact/Effort Matrix**:

| Priority | Impact | Effort | Examples |
|----------|--------|--------|----------|
| **P0** | High | Low | ESLint errors, TypeScript errors |
| **P1** | High | Medium | Large files blocking changes, high `any` concentration |
| **P2** | Medium | Low | Duplicate code in same file |
| **P3** | Medium | Medium | Missing test coverage for critical paths |
| **P4** | Low | Any | Minor style inconsistencies |

**Hotspot Detection:**

- **Files with most `any` types**: Use the **Grep** tool with pattern `: any`, glob `*.{ts,tsx}`, path `src/`, output_mode `count`. Exclude test files. Sort by count descending.
- **Largest non-test files**: Use the **Glob** tool with pattern `src/**/*.{ts,tsx}`. Skip files matching `.test.` or `__tests__`. Read each to get line count, then rank by size.
- **Duplicate code locations**: Use the **Read** tool on `duplication-report/jscpd-report.json` and parse the `duplicates` array to find the most-repeated file paths.

### Phase 3: Sprint Planning

Structure improvement work into focused sprints:

**Sprint Template:**
```markdown
## Sprint [N]: [Theme]

**Duration**: [X] hours
**Goal**: [Specific, measurable objective]

### Tasks
| ID | Task | Effort | Impact |
|----|------|--------|--------|
| 1 | [Task description] | [hours] | [metric improvement] |

### Success Criteria
- [ ] Metric A: [before] → [target]
- [ ] Metric B: [before] → [target]

### Validation
- [ ] All tests pass
- [ ] Lint clean
- [ ] Type-check clean
- [ ] No regressions
```

**Sprint Sizing Guidelines:**
- Quick Win Sprint: 4-8 hours, targets easy P0/P1 items
- Standard Sprint: 16-24 hours, tackles systematic issues
- Deep Dive Sprint: 40+ hours, major architectural refactoring

### Phase 4: Validation

After each sprint, run full validation:

```bash
npm run lint && npm run type-check && npm test
```

**Regression Checklist:**
- [ ] All existing tests pass
- [ ] No new lint warnings introduced
- [ ] No new TypeScript errors
- [ ] Build succeeds
- [ ] Application runs correctly

## Metric Targets Reference

| Metric | Minimum | Good | Excellent |
|--------|---------|------|-----------|
| ESLint Errors | 0 | 0 | 0 |
| ESLint Warnings | <50 | <20 | 0 |
| TypeScript Errors | 0 | 0 | 0 |
| Test Coverage | 60% | 80% | 90%+ |
| Code Duplication | <5% | <2% | <1% |
| `any` Types | <100 | <50 | <20 |
| Files >500 LOC | <10 | <5 | 0 |
| Complexity >15 | <10 | <5 | 0 |

## Output Format

When reporting assessment results, use this format:

```markdown
## Code Quality Assessment - [Date]

### Summary
| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Lint Errors | X | 0 | ✅/❌ |
| Lint Warnings | X | 0 | ✅/❌ |
| TypeScript Errors | X | 0 | ✅/❌ |
| Test Coverage | X% | 80% | ✅/❌ |
| Code Duplication | X% | <2% | ✅/❌ |
| `any` Types | X | <50 | ✅/❌ |
| Large Files | X | 0 | ✅/❌ |

### Top Hotspots
1. [File/Issue]: [Description] - [Recommended action]
2. ...

### Recommended Sprint
[Sprint plan based on hotspots]
```

## Related Files

- `methodology.md` - Refactoring patterns, sprint structure, prioritization, and lessons learned
- `metrics-template.md` - Tracking templates for baseline, sprint progress, and final validation

# Code Quality Methodology

Lessons learned and best practices from production code quality sprints.

## Core Philosophy

> **"Good enough to ship, clean enough to maintain."**

Code quality work exists to enable feature development, not replace it. The goal is a codebase that:
1. **Doesn't block developers** - No errors that prevent builds
2. **Doesn't hide bugs** - Type safety catches issues early
3. **Doesn't resist change** - Modular architecture enables refactoring
4. **Doesn't surprise** - Consistent patterns throughout

## Sprint Structure

### The 5-Sprint Model

Organize code quality work into themed sprints:

| Sprint | Theme | Focus | Typical Duration |
|--------|-------|-------|------------------|
| **1** | Critical Blockers | Errors that break builds/CI | 1-2 weeks |
| **2** | Quick Wins | High-impact, low-effort improvements | 1 week |
| **3** | Architecture | File structure, modularization | 2-3 weeks |
| **4** | Testing | Coverage, test infrastructure | 2 weeks |
| **5** | Polish | Documentation, edge cases | 1 week |

### Sprint 1: Critical Blockers (Do First)

**Goal**: Get to green CI/CD

**Focus**:
- ESLint errors → 0
- TypeScript errors → 0
- Broken tests → fixed
- Build failures → resolved

**Why First**: Nothing else matters if the build is broken. Developers can't work productively with red CI. This sprint has the highest ROI because it unblocks everything else.

**Anti-pattern**: Trying to achieve zero warnings before zero errors. Warnings can wait; errors cannot.

### Sprint 2: Quick Wins (Build Momentum)

**Goal**: Visible progress with minimal effort

**Focus**:
- Obvious duplication in same file
- Simple `any` → proper type fixes
- Unused code removal
- Import organization

**Why Second**: After critical fixes, quick wins build team confidence and demonstrate progress. These changes should be low-risk and obvious.

**Anti-pattern**: Scope creep. Quick wins should be individually completable in <2 hours. If it's bigger, move it to Sprint 3.

### Sprint 3: Architecture (The Hard Work)

**Goal**: Sustainable structure for future development

**Focus**:
- Large file modularization (>500 lines)
- Service layer extraction
- Dependency injection patterns
- API client abstractions

**Why Third**: Architecture work is risky and time-consuming. Do it after the codebase is stable (Sprint 1) and you've built confidence (Sprint 2).

**Key Insight**: Modularization is not just about file size. It's about:
1. **Single responsibility** - Each file does one thing
2. **Testability** - Modules can be tested in isolation
3. **Replaceability** - Implementations can be swapped

### Sprint 4: Testing (Investment in Safety)

**Goal**: Confidence in changes

**Focus**:
- Unit test coverage for services
- Integration tests for critical paths
- Test fixtures and factories
- Mock implementations

**Why Fourth**: Testing requires stable architecture. Writing tests against code that will be refactored is wasted effort. Wait until Sprint 3 settles.

**Coverage Targets**:
- Services: 80%+
- Utilities: 90%+
- Components: 60%+ (harder to test, lower priority)
- Integration: Critical paths only

### Sprint 5: Polish (Professional Finish)

**Goal**: Maintainable for future developers

**Focus**:
- JSDoc for complex functions
- README updates
- Architecture documentation
- Edge case handling

**Why Last**: Polish is low-priority relative to functionality. Do it after everything else is stable.

## Prioritization Framework

### Impact/Effort Matrix

```
                    HIGH IMPACT
                         │
         P1: DO SOON     │    P0: DO NOW
    (Architecture work)  │  (Build blockers)
                         │
  LOW EFFORT ────────────┼──────────── HIGH EFFORT
                         │
         P3: MAYBE       │    P2: PLAN CAREFULLY
    (Minor improvements) │  (Major refactoring)
                         │
                    LOW IMPACT
```

### Priority Definitions

**P0 - Do Now (This Sprint)**
- Build failures
- Test failures blocking CI
- Type errors
- Security vulnerabilities

**P1 - Do Soon (Next Sprint)**
- Files >500 lines being actively modified
- High `any` concentration in core logic
- Duplicate code causing bugs

**P2 - Plan Carefully (Roadmap)**
- Major architectural changes
- Framework upgrades
- Test infrastructure overhaul

**P3 - Maybe (Backlog)**
- Style inconsistencies
- Minor duplication
- Optional type improvements

## Refactoring Patterns

### Pattern 1: File Modularization

**When**: File exceeds 500 lines of meaningful code (not data)

**Process**:
```
Before:
  src/services/bigService.ts (800 lines)

After:
  src/services/bigService/
  ├── index.ts              (re-exports, <50 lines)
  ├── types.ts              (interfaces)
  ├── utils.ts              (pure functions)
  ├── featureA.ts           (cohesive group 1)
  ├── featureB.ts           (cohesive group 2)
  └── __tests__/
      ├── featureA.test.ts
      └── featureB.test.ts
```

**Key Decisions**:
1. **What stays in index.ts?** Only re-exports and minimal orchestration
2. **How to group?** By feature/responsibility, not by type (don't group all interfaces together)
3. **What about existing imports?** Index re-exports maintain backward compatibility

### Pattern 2: Type Safety Improvement

**When**: File has 5+ `any` types

**Process**:
1. **Audit**: List all `any` usages with context
2. **Categorize**:
   - External data (API responses) → Create interface + type guard
   - Internal state → Fix type inference
   - Truly unknown → Use `unknown` with narrowing
3. **Prioritize**: Core business logic first, utilities last
4. **Test**: Type guards need unit tests

**Template for External Data**:
```typescript
// Before
const data: any = await api.fetch();

// After
interface ApiResponse {
  items: Item[];
  total: number;
}

function isApiResponse(data: unknown): data is ApiResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'items' in data &&
    Array.isArray((data as ApiResponse).items)
  );
}

const data = await api.fetch();
if (!isApiResponse(data)) {
  throw new Error('Invalid API response');
}
// data is now typed as ApiResponse
```

### Pattern 3: Duplication Elimination

**When**: Same code appears 3+ times

**Process**:
1. **Verify semantic duplication** - Same purpose, not just similar syntax
2. **Choose extraction location**:
   - Same file → Helper function
   - Same directory → Shared module
   - Cross-cutting → Utils or hooks
3. **Extract with tests** - Write test for shared code first
4. **Update call sites** - One at a time, verify each

**Anti-patterns**:
- Extracting code used only 2 times (premature abstraction)
- Creating "utils" that are actually domain logic
- Parameterizing everything (simple duplication is sometimes clearer)

### Pattern 4: Component Consolidation

**When**: Multiple components share similar structure/styling

**Process**:
1. Identify shared visual patterns (card layout, icon placement, theming)
2. Create a base component with configurable props (title, icon, theme, children, footer)
3. Compose specialized components using the base
4. Extract shared logic to utils (e.g., color theme helpers)
5. Add comprehensive tests for the base component

## Lessons Learned

### What Worked Well

1. **Incremental progress** - Small commits, frequent validation
2. **Metric tracking** - Visible progress motivates continuation
3. **Clear targets** - "Zero warnings" is unambiguous
4. **Parallel work** - Lint fixes don't block type fixes

### What Didn't Work

1. **Big bang refactoring** - Too risky, hard to validate
2. **Stale PRD data** - Always re-measure before starting work
3. **Ignoring test coverage** - Refactoring without tests is dangerous
4. **Perfectionism** - "Good enough" beats "never shipped"

### Key Insights

1. **Measure first, always** - Assumptions about hotspots are often wrong
2. **Modularization > line count** - A well-organized 600-line file beats a poorly-organized 400-line file
3. **Tests enable refactoring** - Coverage should precede major changes
4. **Data files are different** - A 2000-line config is fine; a 2000-line service is not
5. **Warnings are debt** - They accumulate and desensitize the team

## When to Stop

Code quality work is **done enough** when:

- [ ] Build passes (0 errors)
- [ ] CI is green (tests pass)
- [ ] Type safety protects critical paths
- [ ] New developers can understand structure
- [ ] Changes can be made without fear

Code quality work is **never done** - but that's okay. Maintain through:
- Pre-commit hooks (lint, type-check)
- CI enforcement (no warnings policy)
- Code review standards
- Periodic audits (quarterly)

## Tools Reference

| Tool | Purpose | How |
|------|---------|-----|
| ESLint | Lint analysis | `npm run lint` |
| TypeScript | Type checking | `npm run type-check` |
| Vitest | Test coverage | `npx vitest --coverage` |
| jscpd | Duplication | `npx jscpd src --reporters json` |
| Grep tool | `any` type count | Pattern `: any`, glob `*.{ts,tsx}`, path `src/` |
| Glob tool | File size audit | Pattern `src/**/*.{ts,tsx}`, then Read to count lines |


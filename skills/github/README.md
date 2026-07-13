# GitHub Skill

Manage GitHub Wiki pages and GitHub Project boards for the current repository, with built-in knowledge of the authentication quirks for each.

## Overview

This skill handles two GitHub features that have non-obvious auth requirements:

- **Wiki** — must use SSH for push (fine-grained PATs get 403)
- **Projects** — requires an extra OAuth scope (`project`) beyond the default `gh` token

The skill knows these pitfalls and guides you through them instead of letting you hit cryptic errors.

## Quick Start

```
/github wiki list            — Clone the wiki and list all pages
/github wiki edit <page>     — Edit a specific wiki page
/github wiki create <page>   — Create a new wiki page
/github projects list        — List GitHub Projects for this repo
/github projects view <num>  — View a specific project board
```

## Prerequisites

- **SSH key** registered with GitHub (`ssh -T git@github.com` should succeed)
- **`gh` CLI** authenticated (`gh auth login`)
- For Projects: `gh auth refresh -s read:project,project` (one-time scope grant)

## Authentication Reference

| Operation | Auth method | Notes |
|-----------|------------|-------|
| Wiki read (clone) | SSH or HTTPS | Either works |
| Wiki push | SSH only | Fine-grained PATs get 403. Always use `git@github.com:` URL. |
| Issues, PRs, releases | `gh` CLI | Uses the OAuth token from `gh auth login` |
| GitHub Projects | `gh` CLI + `project` scope | Requires `gh auth refresh -s read:project,project` first |

## Wiki Workflow

1. **Clone** — The skill clones the wiki repo via SSH into a temp directory
2. **Edit** — Markdown files are edited with Read/Write/Edit tools
3. **Validate** — Checks for broken links, TODO markers, stale content
4. **Push** — Commits and pushes directly (wiki repos have no PR workflow)

Wiki repos always use the `master` branch, not `main`.

## Projects Workflow

The skill detects the repo owner automatically and uses the `gh project` commands:

```bash
# List projects
gh project list --owner "$OWNER"

# View a project board
gh project view <number> --owner "$OWNER"

# Add an issue to a project
gh project item-add <number> --owner "$OWNER" --url <issue-url>
```

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Wiki push returns 403 | Used HTTPS or fine-grained PAT | Switch to SSH URL (`git@github.com:`) |
| `gh project list` scope error | Default token lacks project scope | `gh auth refresh -s read:project,project` |
| Push to wrong branch | Wiki uses `master`, not `main` | Check `git branch` in wiki clone |
| Stale wiki content | Editing an old clone | `git pull` before editing |

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Skill definition with workflow, auth reference, and commands |

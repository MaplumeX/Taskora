# Tags: effective tags are inherited for filtering, not for display

Tags attach to Tasks, Projects and Areas. Until now a `tagId` task query only
matched a Task's **own** tags, so tagging a Project or an Area had no effect
anywhere: filtering by `Work` did not surface the tasks inside a Project
tagged `Work`.

Things 3 treats Tags as a dimension orthogonal to the Area / Project tree:
tags on an Area or Project apply to everything inside it when filtering, while
each to-do row only shows the tags set on that to-do.

## Decision

A Task's **effective tags** are the union of:

- its own tags,
- its Project's tags,
- its Area's tags — the Area it belongs to directly, or the Area of its
  Project.

A Project's effective tags are its own tags plus its Area's tags.

- **Filtering and querying** use effective tags: the `tagId` task query, the
  list tag filter bar, the Tag detail page.
- **Display** uses own tags only: row capsules, the expanded row, picker check
  marks. An inherited tag cannot be removed from a Task individually.
- Effective tags are **derived, never stored**. Nothing is written to the
  Task, nothing syncs, field-level LWW (ADR-0007) is untouched.

The rule lives once in `@taskora/engine` (`effectiveTaskTagIds`,
`effectiveProjectTagIds`). `taskMatchesQuery` requires the inheritance lookup
(`TagParents`) whenever `tagId` is set and throws without it, so no read path
can silently fall back to own-tags matching. The hub's SQL prefilter widens
`tagId` to own / project / area / project's area tags; the final decision is
still the domain function (same contract fixture on all three sides).

Caches that depend on a `tagId` query must also react to Project and Area
changes: the Engine-mode live query adds `project` and `area` dependencies,
and the REST-mode event applier invalidates `tagId` task lists on Project /
Area events.

## Tag Group stays a container

> **Superseded (2026-10-06)** by [ADR-0016](./0016-nested-tags.md): tags now
> nest, a parent tag is an ordinary tag, and Tag Group is retired. Effective
> tags above are unchanged; matching additionally covers a tag's subtree.

Things 3 also nests tags (a parent tag is itself taggable, and filtering by a
parent includes its children). We keep `TagGroup` as a one-level,
non-taggable container and only borrow the filtering semantics: filtering by a
Tag Group matches any tag in that group. This needs no migration and avoids
arbitrary-depth trees, at the cost of not being able to tag something with
the group itself.

## Alternatives rejected

- **Copy Project / Area tags onto Tasks on write**: turns a derivation into
  synced state; moving a Task out of a Project would have to remove exactly
  the copied tags, and concurrent edits on two devices would fight over them.
- **Inherit for display too**: rows become noisy and the user can no longer
  tell which tags they set on the Task itself.

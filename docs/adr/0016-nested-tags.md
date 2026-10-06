# Nested tags replace tag groups

ADR 0015 kept `TagGroup` as a one-level container that cannot be applied to
anything, and borrowed only Things 3's filtering semantics: filtering by a
group matched any tag in it. In practice that left two concepts for one idea.
A user who wants both a `Work` filter and a `Work` label on a to-do needed a
group and a tag with the same name, and filtering by one did not match the
other. Things 3 has a single concept: tags nest, and a parent tag is an
ordinary tag.

## Decision

- A `Tag` has an optional `parentId` (another Tag). Depth is unlimited.
  Siblings are ordered by `position`, like every other entity.
- A parent tag is an ordinary tag: it can be applied, has a color and a
  detail page.
- `TagGroup`, `Tag.tagGroupId` and the `/tag-groups` API are retired.
- **Matching**: an item matches tag T when its effective tags (ADR 0015)
  contain T or any descendant of T. Ancestors are not expanded: a to-do
  tagged only `Work` does not match `Meeting`. This applies to the `tagId`
  task query, the list filter bar, the Tag detail page and Quick Find.
  Display is unchanged: rows show their own tags by title only.
- **Deleting a parent tag** keeps its children and moves them to the top
  level (`onDelete: SetNull` on the hub, `COMPACT_NULL_REFS` on replicas),
  matching how deleting a group behaved. Deleting one tag never removes a
  whole subtree.

The tree logic lives once in `@taskora/engine` (`buildTagTree`,
`tagParentCreatesCycle`, `tagHit`). `TagParents` carries the tag tree, so every
read path that answers a `tagId` query has to provide it.

## Cycles

Field-level LWW (ADR 0007) can combine two valid edits into a cycle: one
device sets A under B while another sets B under A. Three layers handle it:

1. Write paths refuse moves that would create a cycle (REST answers 400, the
   Engine tag backend throws, the UI does not offer such drop targets).
2. The hub repairs after every merge that writes a tag's `parentId`:
   `repairEntity` walks up from the new parent with a probe of the user's tags.
   If the walk returns to the tag itself, the merged row's `parentId` is reset
   to `null` with a winning virtual-device-0 clock, so every device converges.
3. Readers tolerate cycles that have not been repaired yet. `buildTagTree`
   treats the tag with the smallest id on a cycle as top level, and treats
   self-references and dangling parents as top level. Every device gets the
   same tree without coordinating.

Two pushes for A and B that run in parallel transactions can still both pass
step 2. Step 3 keeps the tree usable until the next edit repairs it.

## Migration and sync protocol 5

The wire format changes incompatibly: the `tag-group` entity disappears and
`tagGroupId` becomes `parentId`. Both sides convert existing data by the same
rule, so the result is identical without syncing anything:

- every Tag Group becomes a top-level Tag **with the same id**. Title,
  position and timestamps keep their values and clocks. The color takes the
  column default (`#3B82F6`) with no clock;
- members' `tagGroupId` becomes `parentId`, value and clock key alike;
- compact registrations for `tag-group` become `tag`.

The hub does this in a Prisma migration without writing `SyncChange`. Each
replica does it in schema step 10 → 11, which also rewrites pending Outbox
entries (`tag-group` → `tag`, `tagGroupId` → `parentId`). A parity test feeds
the same data through both and compares rows and clocks.

`SYNC_PROTOCOL_VERSION` and the hub's `minProtocolVersion` both become 5.
Protocol-4 clients would keep writing `tag-group` and `tagGroupId`. The hub no
longer understands either, so those writes would stay rejected in the Outbox
forever, and tag hierarchy edits would be lost silently. Raising the minimum
gives those clients a 426 and an upgrade prompt instead.

A device that upgrades before its hub skips the `tag-group` events the old hub
still sends. To cover that, the replica migration records a one-time flag. On
the first sync against a protocol-5 hub, the device resets its cursor and
bootstraps once, with its Outbox kept. When the hub upgrades first (the usual
order), the bootstrap only confirms what the device already has.

## Alternatives rejected

- **Keep groups and add nesting under them**: keeps two concepts and still
  cannot apply a group.
- **Migrate groups into new tags with fresh ids and remap members**: the
  replica and the hub would need to agree on generated ids, or the hub would
  have to log the conversion as Change Events. Reusing the group id makes the
  conversion a pure function of existing data.
- **Delete children with their parent**: an accidental delete would take a
  whole subtree with it. Promoting children matches the previous group
  behavior and is undoable through the management page's delayed delete.

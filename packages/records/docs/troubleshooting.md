# Troubleshooting

- [`referencedBy: posts.authorId already references users`](#referencedby-postsauthorid-already-references-users)
- [`labelledBy: posts.ownerId already has a label target`](#labelledby-postsownerid-already-has-a-label-target)
- [`purge: <label> <id> has no subject to log the delete against`](#purge-label-id-has-no-subject-to-log-the-delete-against)
- [My `referenced` refusal never reaches the caller](#my-referenced-refusal-never-reaches-the-caller)

## `referencedBy: posts.authorId already references users`

The same pair was registered twice, often because the module that registers
it is imported twice or the registry is created per request. Create one
registry at startup and register each pair once.

## `labelledBy: posts.ownerId already has a label target`

A field takes one label target. Remove the duplicate call.

## `purge: <label> <id> has no subject to log the delete against`

You passed `subject`, and it returned nothing for this record, so the purge
would have committed with no audit line. The transaction was aborted and the
record is still there. Fix the record's data, or make `subject` read the right
field. A record that belongs to no one should be purged with no `subject`
option.

## My `referenced` refusal never reaches the caller

With `subject`, a refusal is followed by a `read` line written with
`log(undefined, …)`. If that write throws, its error replaces yours. Check
your audit log's availability.

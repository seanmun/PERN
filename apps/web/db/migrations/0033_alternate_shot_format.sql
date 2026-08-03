-- Alternate Shot: the eighth v1 format (§8 of docs/buddycup-rebuild-spec.md).
-- It has existed in FORMAT_META and the scoring engine all along, but was
-- unreachable — rounds.format / matches.format are the round_format enum,
-- so createEventFromForm rejected it at isRoundFormat() and no alternate
-- shot match could ever be saved. §12.2 calls this migration a
-- prerequisite; the §11 harness fails loudly until it is applied.
--
-- Purely additive: adding an enum value cannot affect any existing row,
-- and nothing reads the new value until the schema.ts change ships.
-- Applied via the Neon SQL editor per house workflow.

ALTER TYPE "round_format" ADD VALUE IF NOT EXISTS 'alternate_shot';

/**
 * BigInt JSON-serialization shim.
 *
 * Express/Nest's default `JSON.stringify` cannot serialize a BigInt and
 * throws `TypeError: Do not know how to serialize a BigInt`. Prisma maps
 * `BigInt` columns (e.g. `documents.size_bytes`) to JS `bigint`, so every
 * response that includes one would otherwise blow up.
 *
 * We patch `BigInt.prototype.toJSON` to return a Number — safe because our
 * BigInt fields are file sizes capped at 100 MB (well under
 * `Number.MAX_SAFE_INTEGER = 2^53 - 1`). If a future field needs the full
 * 64-bit range, switch this to a string and update API consumers.
 *
 * Side-effect import — load once from `main.ts` and test bootstrap.
 */
if (
  typeof BigInt !== "undefined" &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (BigInt.prototype as any).toJSON !== "function"
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function (this: bigint): number {
    return Number(this);
  };
}

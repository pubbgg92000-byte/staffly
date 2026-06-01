/**
 * Unit tests for the Prisma tenant extension helpers.
 *
 * These tests do NOT require Postgres or Docker — they exercise the pure functions
 * that the extension uses to mutate Prisma query args.
 *
 * The full integration test (real DB, two tenants, isolation assertions per
 * docs/02 § 8) lives in `test/tenant/isolation.integration.spec.ts` and runs only
 * when Docker is available.
 */
import { describe, it, expect } from "vitest";
import {
  withTenantWhere,
  withTenantData,
  assertWhereOrgMatches,
  isPlainObject,
} from "../../src/tenant/prisma-tenant.extension";
import {
  runWithTenant,
  currentOrganizationId,
  currentTenant,
  TenantBoundaryViolation,
} from "../../src/tenant/tenant-context";

const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";

describe("isPlainObject", () => {
  it("recognises plain objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it("rejects arrays, null, primitives", () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject("x")).toBe(false);
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });
});

describe("assertWhereOrgMatches", () => {
  it("accepts undefined / mismatched-shape where", () => {
    expect(() =>
      assertWhereOrgMatches(undefined, ORG_A, "User", "findMany"),
    ).not.toThrow();
    expect(() =>
      assertWhereOrgMatches("not an object", ORG_A, "User", "findMany"),
    ).not.toThrow();
  });

  it("accepts matching explicit organizationId", () => {
    expect(() =>
      assertWhereOrgMatches(
        { organizationId: ORG_A },
        ORG_A,
        "User",
        "findMany",
      ),
    ).not.toThrow();
  });

  it("throws TenantBoundaryViolation on mismatched organizationId", () => {
    expect(() =>
      assertWhereOrgMatches(
        { organizationId: ORG_B },
        ORG_A,
        "User",
        "findMany",
      ),
    ).toThrow(TenantBoundaryViolation);
  });
});

describe("withTenantWhere", () => {
  it("injects organizationId when no where supplied", () => {
    const out = withTenantWhere(undefined, ORG_A, "User", "findMany");
    expect(out.where).toEqual({ organizationId: ORG_A });
  });

  it("preserves caller-supplied where", () => {
    const out = withTenantWhere(
      { where: { email: "x@y.com" } },
      ORG_A,
      "User",
      "findMany",
    );
    expect(out.where).toEqual({
      email: "x@y.com",
      organizationId: ORG_A,
    });
  });

  it("rejects cross-tenant explicit where", () => {
    expect(() =>
      withTenantWhere(
        { where: { organizationId: ORG_B } },
        ORG_A,
        "User",
        "update",
      ),
    ).toThrow(TenantBoundaryViolation);
  });
});

describe("withTenantData", () => {
  it("injects organizationId on single create", () => {
    const out = withTenantData({ data: { email: "x@y.com" } }, ORG_A);
    expect(out.data).toEqual({ organizationId: ORG_A, email: "x@y.com" });
  });

  it("injects organizationId on bulk create", () => {
    const out = withTenantData(
      { data: [{ email: "a@y.com" }, { email: "b@y.com" }] },
      ORG_A,
    );
    expect(out.data).toEqual([
      { organizationId: ORG_A, email: "a@y.com" },
      { organizationId: ORG_A, email: "b@y.com" },
    ]);
  });

  it("does not override caller-supplied organizationId in data", () => {
    // The extension trusts caller-supplied org on data because it's already been
    // checked at the controller layer; the security boundary is `where`, not `data`.
    const out = withTenantData(
      { data: { organizationId: ORG_A, email: "x@y.com" } },
      ORG_A,
    );
    expect(out.data).toEqual({ organizationId: ORG_A, email: "x@y.com" });
  });
});

describe("AsyncLocalStorage tenant context", () => {
  it("is undefined outside runWithTenant", () => {
    expect(currentTenant()).toBeUndefined();
    expect(currentOrganizationId()).toBeUndefined();
  });

  it("propagates synchronously through runWithTenant", () => {
    runWithTenant({ organizationId: ORG_A, userId: "u" }, () => {
      expect(currentOrganizationId()).toBe(ORG_A);
      expect(currentTenant()?.userId).toBe("u");
    });
    expect(currentOrganizationId()).toBeUndefined();
  });

  it("propagates across awaited async work", async () => {
    await runWithTenant({ organizationId: ORG_A }, async () => {
      await Promise.resolve();
      expect(currentOrganizationId()).toBe(ORG_A);
    });
  });

  it("isolates parallel contexts", async () => {
    const observed: string[] = [];
    await Promise.all([
      runWithTenant({ organizationId: ORG_A }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        observed.push(currentOrganizationId() ?? "?");
      }),
      runWithTenant({ organizationId: ORG_B }, async () => {
        await new Promise((r) => setTimeout(r, 2));
        observed.push(currentOrganizationId() ?? "?");
      }),
    ]);
    expect(observed.sort()).toEqual([ORG_A, ORG_B].sort());
  });
});

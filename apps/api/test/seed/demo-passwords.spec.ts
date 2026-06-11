import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EMPLOYEE_DEFAULT_PASSWORD,
  MissingDemoPasswordError,
  loadDemoEnv,
  parseEnvFile,
  resolveDemoPassword,
  resolveDemoPasswords,
} from "../../prisma/seed-lib/demo-passwords";

// RC-01-residual: the demo seed must NOT silently generate unknown admin
// passwords. These cover the pure resolution logic without a database.

const ALL_ADMIN_ENV = {
  DEMO_SUPERADMIN_PASSWORD: "Super@12345",
  DEMO_HR_PASSWORD: "HrPass@12345",
  DEMO_MANAGER_PASSWORD: "Manager@1234",
};

describe("resolveDemoPasswords — fail fast on missing admin passwords (RC-01)", () => {
  it("resolves all four roles from env when present", () => {
    const out = resolveDemoPasswords({
      ...ALL_ADMIN_ENV,
      DEMO_EMPLOYEE_PASSWORD: "EmpPass@1234",
    });
    expect(out.super_admin).toEqual({ password: "Super@12345", source: "env" });
    expect(out.hr_admin.source).toBe("env");
    expect(out.manager.source).toBe("env");
    expect(out.employee).toEqual({ password: "EmpPass@1234", source: "env" });
  });

  it("falls back to the published default for employee only", () => {
    const out = resolveDemoPasswords(ALL_ADMIN_ENV); // no DEMO_EMPLOYEE_PASSWORD
    expect(out.employee).toEqual({
      password: EMPLOYEE_DEFAULT_PASSWORD,
      source: "public demo",
    });
  });

  it("throws when ALL admin passwords are missing, listing every var", () => {
    let err: unknown;
    try {
      resolveDemoPasswords({});
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MissingDemoPasswordError);
    const msg = (err as Error).message;
    expect(msg).toContain("DEMO_SUPERADMIN_PASSWORD");
    expect(msg).toContain("DEMO_HR_PASSWORD");
    expect(msg).toContain("DEMO_MANAGER_PASSWORD");
    // never leaks the employee var into the admin-missing list
    expect(msg).not.toContain("DEMO_EMPLOYEE_PASSWORD");
  });

  it("throws listing ONLY the missing admin var(s)", () => {
    let err: unknown;
    try {
      resolveDemoPasswords({
        DEMO_SUPERADMIN_PASSWORD: "Super@12345",
        DEMO_MANAGER_PASSWORD: "Manager@1234",
        // DEMO_HR_PASSWORD missing
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MissingDemoPasswordError);
    expect((err as MissingDemoPasswordError).roles).toEqual(["hr_admin"]);
  });

  it("treats a too-short env password as missing (fail fast)", () => {
    expect(() =>
      resolveDemoPasswords({
        ...ALL_ADMIN_ENV,
        DEMO_HR_PASSWORD: "short", // < 8 chars
      }),
    ).toThrow(MissingDemoPasswordError);
  });
});

describe("resolveDemoPassword — single role", () => {
  it("throws for an admin role with no env value", () => {
    expect(() => resolveDemoPassword("manager", {})).toThrow(
      MissingDemoPasswordError,
    );
  });

  it("returns the published default for employee with no env value", () => {
    expect(resolveDemoPassword("employee", {})).toEqual({
      password: EMPLOYEE_DEFAULT_PASSWORD,
      source: "public demo",
    });
  });
});

describe("parseEnvFile + loadDemoEnv — explicit .env loading (RC-01)", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("parses KEY=VALUE, comments, blank lines, and quotes", () => {
    dir = mkdtempSync(path.join(tmpdir(), "demo-env-"));
    const file = path.join(dir, ".env");
    writeFileSync(
      file,
      [
        "# a comment",
        "",
        "DEMO_SUPERADMIN_PASSWORD=Super@12345",
        'DEMO_HR_PASSWORD="Hr With Spaces@1"',
        "DEMO_MANAGER_PASSWORD='Manager@1234'",
        "IGNORED_NO_EQUALS",
      ].join("\n"),
    );
    const parsed = parseEnvFile(file);
    expect(parsed.DEMO_SUPERADMIN_PASSWORD).toBe("Super@12345");
    expect(parsed.DEMO_HR_PASSWORD).toBe("Hr With Spaces@1");
    expect(parsed.DEMO_MANAGER_PASSWORD).toBe("Manager@1234");
    expect(parsed.IGNORED_NO_EQUALS).toBeUndefined();
  });

  it("returns {} when the .env file is absent", () => {
    expect(parseEnvFile("/no/such/file/.env")).toEqual({});
  });

  it("loads admin passwords from .env so the seed works under tsx (the RC-01 fix)", () => {
    dir = mkdtempSync(path.join(tmpdir(), "demo-env-"));
    const file = path.join(dir, ".env");
    writeFileSync(
      file,
      Object.entries(ALL_ADMIN_ENV)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    );
    // process env without the DEMO_* vars (the bug scenario under tsx)
    const merged = loadDemoEnv({ PATH: "x" } as NodeJS.ProcessEnv, file);
    expect(() => resolveDemoPasswords(merged)).not.toThrow();
    expect(merged.DEMO_SUPERADMIN_PASSWORD).toBe("Super@12345");
  });

  it("lets an exported var override the .env file value", () => {
    dir = mkdtempSync(path.join(tmpdir(), "demo-env-"));
    const file = path.join(dir, ".env");
    writeFileSync(file, "DEMO_SUPERADMIN_PASSWORD=FromFile@123");
    const merged = loadDemoEnv(
      { DEMO_SUPERADMIN_PASSWORD: "FromEnv@1234" } as NodeJS.ProcessEnv,
      file,
    );
    expect(merged.DEMO_SUPERADMIN_PASSWORD).toBe("FromEnv@1234");
  });
});

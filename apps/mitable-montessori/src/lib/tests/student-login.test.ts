import { describe, expect, it } from "vitest";
import {
  generateLoginCode,
  generateStudentPassword,
  normalizeLoginCode,
  safeStudentRedirect,
  studentLoginEmail,
} from "./student-login";

describe("student login", () => {
  it("generates codes without characters children confuse", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateLoginCode()).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
      expect(generateStudentPassword()).toMatch(/^[2-9A-HJKMNP-Z]{10}$/);
    }
  });

  it("forgives spaces, dashes and lower case when signing in", () => {
    expect(normalizeLoginCode(" ab3d-ef 45 ")).toBe("AB3DEF45");
    expect(studentLoginEmail("ab3d-ef45")).toBe(studentLoginEmail("AB3DEF45"));
  });

  it("uses a reserved domain, so no email can reach a real address", () => {
    expect(studentLoginEmail("AB3DEF45")).toBe("ab3def45@students.mitable.invalid");
  });

  it("only redirects within the student section", () => {
    expect(safeStudentRedirect("/student/tests/1")).toBe("/student/tests/1");
    expect(safeStudentRedirect("/app/roster")).toBeNull();
    expect(safeStudentRedirect("//evil.example")).toBeNull();
    expect(safeStudentRedirect(null)).toBeNull();
  });
});

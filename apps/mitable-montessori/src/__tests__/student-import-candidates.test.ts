import { describe, expect, it } from "vitest";
import { StudentImportCandidateSchema } from "@/lib/admin/student-import-candidates";
import {
  analyzeImportDraft,
  buildDraftsFromStudentCandidates,
  buildImportDrafts,
  buildStudentImportPlan,
  detectImportMapping,
  parseImportText,
  shouldParseStudentImportFileLocally,
} from "@/lib/admin/student-import";
import { DOCX_MIME_TYPE, validateStudentImportFile } from "@/lib/admin/student-import-ai";
import { docxBufferToImportText, wordDocumentXmlToImportText } from "@/lib/admin/docx-import-text";

describe("AI-assisted student import drafts", () => {
  it("parses legacy CSV profile and guardian headers without AI", () => {
    const csv = [
      "ADMISSION NUMBER,SURNAME,MIDDLE NAME,FIRST NAME,CLASS,TERM,YEAR,DATE OF BIRTH,SEX,STATE,PARENT OR GUARDIAN,CONTACT ADDRESS,PRIMARY PHONE NUMBER,ALTERNATIVE PHONE NUMBER,PARENT PRIMARY EMAIL,FATHER NAME,FATHER CONTACT,FATHER EMAIL,FATHER PHONE,MOTHER NAME,MOTHER CONTACT,MOTHER EMAIL,MOTHER PHONE",
      "ADM-105,Okafor,Nneka,Amara,Africa Red Team,Term 1,2026/2027,15/11/2024,Female,Lagos,Ada Okafor,1 Main Street,555-0101,555-0102,ada@example.com,Chidi Okafor,555-0202,chidi@example.com,555-0201,Ifeoma Okafor,555-0302,ifeoma@example.com,555-0301",
    ].join("\n");

    const parsed = parseImportText(csv);
    expect(parsed).not.toBeNull();
    const mapping = detectImportMapping(parsed!.headers);
    const [draft] = buildImportDrafts(parsed!.rows, mapping);

    expect(draft).toMatchObject({
      firstName: "Amara",
      lastName: "Okafor",
      birthDate: "15/11/2024",
      classroomName: "Africa Red Team",
      guardianName: "Ada Okafor",
      guardianEmail: "ada@example.com",
      guardianPhone: "555-0101",
      guardianAlternativePhone: "555-0102",
      guardianContactAddress: "1 Main Street",
      guardianPrimary: true,
      profile: {
        middleName: "Nneka",
        admissionNumber: "ADM-105",
        sex: "Female",
        academicTerm: "Term 1",
        academicYear: "2026/2027",
        state: "Lagos",
      },
    });
    expect(draft.additionalGuardians).toEqual([
      expect.objectContaining({
        name: "Chidi Okafor",
        email: "chidi@example.com",
        phone: "555-0201",
        alternativePhone: "555-0202",
        relationship: "father",
      }),
      expect.objectContaining({
        name: "Ifeoma Okafor",
        email: "ifeoma@example.com",
        phone: "555-0301",
        alternativePhone: "555-0302",
        relationship: "mother",
      }),
    ]);
  });

  it("routes uploaded text rosters to the deterministic parser", () => {
    expect(shouldParseStudentImportFileLocally({ name: "roster.csv", type: "text/csv" })).toBe(
      true
    );
    expect(shouldParseStudentImportFileLocally({ name: "roster.CSV" })).toBe(true);
    expect(shouldParseStudentImportFileLocally({ name: "roster.tsv" })).toBe(true);
    expect(
      shouldParseStudentImportFileLocally({ name: "roster.pdf", type: "application/pdf" })
    ).toBe(false);
  });

  it("splits multiple parent emails into separate guardian contacts", () => {
    const parsed = parseImportText(
      "FIRST NAME,SURNAME,CLASS,PARENT PRIMARY EMAIL\nAmara,Okafor,Africa Red Team,ada@example.com;chidi@example.com"
    );
    expect(parsed).not.toBeNull();
    const [draft] = buildImportDrafts(parsed!.rows, detectImportMapping(parsed!.headers));

    expect(draft.guardianEmail).toBe("ada@example.com");
    expect(draft.additionalGuardians).toEqual([
      expect.objectContaining({ email: "chidi@example.com", relationship: "guardian" }),
    ]);
  });

  it("deduplicates a primary guardian repeated in a parent-specific column", () => {
    const parsed = parseImportText(
      "FIRST NAME,SURNAME,CLASS,PARENT PRIMARY EMAIL,MOTHER NAME,MOTHER EMAIL\nAmara,Okafor,Africa Red Team,ada@example.com,Ada Okafor,ada@example.com"
    );
    expect(parsed).not.toBeNull();
    const [draft] = buildImportDrafts(parsed!.rows, detectImportMapping(parsed!.headers));
    const analysis = analyzeImportDraft(draft, [{ id: "room-1", name: "Africa Red Team" }]);

    expect(analysis.ready?.guardians).toEqual([
      expect.objectContaining({
        name: "Ada Okafor",
        email: "ada@example.com",
        relationship: "mother",
        primary: true,
      }),
    ]);
  });

  it("keeps child profile fields and creates a linked mother and father", () => {
    const candidate = StudentImportCandidateSchema.parse({
      first_name: "Amara",
      middle_name: "Nneka",
      last_name: "Okafor",
      birth_date: "2019-04-15",
      classroom: "Primary East",
      admission_number: "ADM-105",
      health_info: "Nut allergy",
      academic_term: "Term 1",
      academic_year: "2026/2027",
      guardians: [
        {
          first_name: "Ada",
          last_name: "Okafor",
          email: "ada@example.com",
          phone: "555-0101",
          relationship: "mother",
          is_primary_contact: true,
        },
        {
          first_name: "Chidi",
          last_name: "Okafor",
          email: "chidi@example.com",
          relationship: "father",
        },
      ],
    });

    const [draft] = buildDraftsFromStudentCandidates([candidate]);
    const analysis = analyzeImportDraft(draft, [{ id: "room-1", name: "Primary East" }]);
    const { plan } = buildStudentImportPlan([analysis], []);

    expect(plan?.newStudents).toHaveLength(1);
    expect(plan?.newStudents[0]).toMatchObject({
      firstName: "Amara",
      lastName: "Okafor",
      birthDate: "2019-04-15",
      classroomId: "room-1",
      profile: {
        middleName: "Nneka",
        admissionNumber: "ADM-105",
        healthInfo: "Nut allergy",
        academicTerm: "Term 1",
        academicYear: "2026/2027",
      },
    });
    expect(plan?.newStudents[0]?.guardians).toEqual([
      expect.objectContaining({ name: "Ada Okafor", relationship: "mother", primary: true }),
      expect.objectContaining({ name: "Chidi Okafor", relationship: "father", primary: false }),
    ]);
  });

  it("accepts DOCX files and turns Word table XML into readable source rows", () => {
    expect(() =>
      validateStudentImportFile({
        fileBase64: Buffer.from("name").toString("base64"),
        mimeType: "text/csv",
      })
    ).not.toThrow();
    expect(() =>
      validateStudentImportFile({
        fileBase64: Buffer.from("name").toString("base64"),
        mimeType: DOCX_MIME_TYPE,
      })
    ).not.toThrow();
    expect(() =>
      validateStudentImportFile({
        fileBase64: Buffer.from("name").toString("base64"),
        mimeType: "application/vnd.ms-excel",
      })
    ).toThrow("DOCX, CSV, TSV, PDF");

    expect(
      wordDocumentXmlToImportText(
        "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>FIRST NAME</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Maya</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>SURNAME</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Clarke</w:t></w:r></w:p></w:tc></w:tr></w:tbl>"
      )
    ).toBe("FIRST NAME\tMaya\nSURNAME\tClarke");

    const docxXml =
      "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>FIRST NAME</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Maya</w:t></w:r></w:p></w:tc></w:tr></w:tbl>";
    expect(docxBufferToImportText(makeStoredDocx(docxXml))).toBe("FIRST NAME\tMaya");
  });
});

function makeStoredDocx(xml: string): Buffer {
  const name = Buffer.from("word/document.xml");
  const content = Buffer.from(xml);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);

  const centralOffset = local.length + name.length + content.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, name, content, central, name, end]);
}

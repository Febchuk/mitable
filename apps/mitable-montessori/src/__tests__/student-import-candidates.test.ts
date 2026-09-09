import { describe, expect, it } from "vitest";
import { StudentImportCandidateSchema } from "@/lib/admin/student-import-candidates";
import {
  analyzeImportDraft,
  buildDraftsFromStudentCandidates,
  buildStudentImportPlan,
} from "@/lib/admin/student-import";
import { DOCX_MIME_TYPE, validateStudentImportFile } from "@/lib/admin/student-import-ai";
import { docxBufferToImportText, wordDocumentXmlToImportText } from "@/lib/admin/docx-import-text";

describe("AI-assisted student import drafts", () => {
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

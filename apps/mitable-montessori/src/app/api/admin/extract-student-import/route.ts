import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/api/admin-auth";
import {
  extractStudentImport,
  StudentImportExtractionError,
  validateStudentImportFile,
} from "@/lib/admin/student-import-ai";
import { z } from "zod";

const RequestSchema = z.object({
  file_name: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(100),
  file_base64: z.string().min(4).max(14_000_000),
});

/** Returns an editable draft only; this endpoint never creates students. */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid import file" }, { status: 400 });
  }

  try {
    const byteSize = validateStudentImportFile({
      fileBase64: parsed.data.file_base64,
      mimeType: parsed.data.mime_type,
    });
    const extraction = await extractStudentImport({
      fileBase64: parsed.data.file_base64,
      mimeType: parsed.data.mime_type,
      fileName: parsed.data.file_name,
    });
    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "admin_extract_student_import",
      metadata: {
        mime_type: parsed.data.mime_type,
        byte_size: byteSize,
        extracted_count: extraction.students.length,
      },
    });
    return NextResponse.json(extraction);
  } catch (error) {
    const message =
      error instanceof StudentImportExtractionError
        ? error.message
        : "We could not read that roster. Try a clearer file or use CSV.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

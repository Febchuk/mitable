import { supabaseAdmin } from "../../shared-infra/lib/supabase.js";
import { createLogger } from "../../shared-infra/lib/logger.js";

const logger = createLogger({ module: "MontessoriTemplateStorage" });

/**
 * TemplateStorageService — thin wrapper over Supabase Storage for
 * the Montessori report template + generated artefact files.
 *
 * Bucket layout (private):
 *   montessori-templates/
 *     ${organizationId}/templates/${templateId}/source.{docx|pdf}
 *     ${organizationId}/reports/${reportId}/generated.docx
 *     ${organizationId}/reports/${reportId}/generated.pdf
 *
 * Every read goes through a short-lived signed URL — the bucket is
 * NOT public. Service-role uploads bypass RLS.
 */

export const TEMPLATES_BUCKET = "montessori-templates";

let bucketReady = false;

async function ensureBucket(): Promise<void> {
    if (bucketReady) return;
    const { data, error } = await supabaseAdmin.storage.getBucket(TEMPLATES_BUCKET);
    if (data) {
        bucketReady = true;
        return;
    }
    // 404 means we need to create it. Other errors bubble.
    if (error && !/not.?found|404/i.test(error.message)) {
        throw new Error(`Failed to look up storage bucket: ${error.message}`);
    }
    const { error: createError } = await supabaseAdmin.storage.createBucket(TEMPLATES_BUCKET, {
        public: false,
    });
    if (createError && !/already exists/i.test(createError.message)) {
        throw new Error(`Failed to create storage bucket: ${createError.message}`);
    }
    bucketReady = true;
    logger.info({ bucket: TEMPLATES_BUCKET }, "Created Montessori templates bucket");
}

export function templateSourcePath(args: {
    organizationId: string;
    templateId: string;
    sourceFormat: "docx" | "pdf";
}): string {
    return `${args.organizationId}/templates/${args.templateId}/source.${args.sourceFormat}`;
}

export function reportArtefactPath(args: {
    organizationId: string;
    reportId: string;
    format: "docx" | "pdf";
}): string {
    return `${args.organizationId}/reports/${args.reportId}/generated.${args.format}`;
}

export async function uploadBytes(args: {
    path: string;
    bytes: Buffer;
    contentType: string;
}): Promise<void> {
    await ensureBucket();
    const { error } = await supabaseAdmin.storage
        .from(TEMPLATES_BUCKET)
        .upload(args.path, args.bytes, {
            contentType: args.contentType,
            upsert: true,
        });
    if (error) {
        throw new Error(`Upload to ${args.path} failed: ${error.message}`);
    }
}

export async function deleteAtPath(path: string): Promise<void> {
    await ensureBucket();
    const { error } = await supabaseAdmin.storage.from(TEMPLATES_BUCKET).remove([path]);
    if (error && !/not.?found|404/i.test(error.message)) {
        // Non-fatal — log and move on so a missing file doesn't block
        // a row delete on the application side.
        logger.warn({ path, error: error.message }, "Storage delete failed");
    }
}

export async function createSignedUrl(args: {
    path: string;
    expiresInSeconds?: number;
}): Promise<string> {
    await ensureBucket();
    const { data, error } = await supabaseAdmin.storage
        .from(TEMPLATES_BUCKET)
        .createSignedUrl(args.path, args.expiresInSeconds ?? 60);
    if (error || !data) {
        throw new Error(`Signed URL creation failed: ${error?.message ?? "unknown"}`);
    }
    return data.signedUrl;
}

export async function downloadBytes(path: string): Promise<Buffer> {
    await ensureBucket();
    const { data, error } = await supabaseAdmin.storage.from(TEMPLATES_BUCKET).download(path);
    if (error || !data) {
        throw new Error(`Download from ${path} failed: ${error?.message ?? "unknown"}`);
    }
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

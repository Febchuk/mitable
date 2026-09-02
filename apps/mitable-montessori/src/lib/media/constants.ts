export const STUDENT_MEDIA_BUCKET = "student-media";

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export const PHOTO_MIME_TYPES = ["image/jpeg", "image/webp"] as const;
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm"] as const;
export const STUDENT_MEDIA_MIME_TYPES = [...PHOTO_MIME_TYPES, ...VIDEO_MIME_TYPES] as const;

export type StudentMediaKind = "photo" | "video";
export type StudentMediaMimeType = (typeof STUDENT_MEDIA_MIME_TYPES)[number];

export function mediaKindForMimeType(mimeType: string): StudentMediaKind | null {
  if (PHOTO_MIME_TYPES.includes(mimeType as (typeof PHOTO_MIME_TYPES)[number])) return "photo";
  if (VIDEO_MIME_TYPES.includes(mimeType as (typeof VIDEO_MIME_TYPES)[number])) return "video";
  return null;
}

export function mediaExtension(mimeType: StudentMediaMimeType) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
  }
}

export function isAllowedMediaMimeType(kind: StudentMediaKind, mimeType: string) {
  return kind === "photo"
    ? PHOTO_MIME_TYPES.includes(mimeType as (typeof PHOTO_MIME_TYPES)[number])
    : VIDEO_MIME_TYPES.includes(mimeType as (typeof VIDEO_MIME_TYPES)[number]);
}

export function maxMediaBytes(kind: StudentMediaKind) {
  return kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
}

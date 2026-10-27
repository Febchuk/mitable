import { PRODUCTION_APP_ORIGIN } from "@/lib/auth/password-reset";

/** School-specific identity for the shared Montessori app. */
export function getSchoolBranding(schoolName: string | null | undefined) {
  if (!schoolName || !/^the learning place(?:\s|$)/i.test(schoolName.trim())) return null;

  const logoPath = "/school-brands/the-learning-place.png";
  return {
    name: "The Learning Place",
    logoPath,
    emailLogoUrl: `${PRODUCTION_APP_ORIGIN}${logoPath}`,
    contactEmail: "academics@thelearningplaceng.com",
  };
}

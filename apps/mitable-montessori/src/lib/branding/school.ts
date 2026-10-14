/** School-specific identity for the shared Montessori app. */
export function getSchoolBranding(schoolName: string | null | undefined) {
  if (!schoolName || !/^the learning place(?:\s|$)/i.test(schoolName.trim())) return null;

  return {
    name: "The Learning Place",
    logoPath: "/school-brands/the-learning-place.jpg",
    emailLogoUrl: "https://thelearningplaceng.com/wp-content/uploads/2021/04/cropped-TLP_logo.jpg",
    headOfSchoolEmail: "hos@thelearningplaceng.com",
  };
}

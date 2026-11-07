/** No 0/O or 1/I/L, because children copy these from a printed slip. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomString(length: number): string {
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (value) => ALPHABET[value % ALPHABET.length]).join("");
}

export function generateLoginCode(): string {
  return randomString(8);
}

export function generateStudentPassword(): string {
  return randomString(10);
}

/** Students often have no email, but Supabase Auth signs in by email. Nothing is ever sent here. */
export function studentLoginEmail(loginCode: string): string {
  return `${normalizeLoginCode(loginCode).toLowerCase()}@students.mitable.invalid`;
}

export function normalizeLoginCode(loginCode: string): string {
  return loginCode.replace(/[\s-]/g, "").toUpperCase();
}

/** Accept only an in-app student destination to prevent open redirects. */
export function safeStudentRedirect(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/student") || value.startsWith("//")) return null;
  return value;
}

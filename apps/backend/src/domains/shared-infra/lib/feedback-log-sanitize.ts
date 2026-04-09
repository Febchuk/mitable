/**
 * Strip obvious secrets from log text before email, attachments, or LLM analysis.
 * Best-effort regexes — not a full parser; reduces accidental leakage of tokens/passwords.
 */
export function sanitizeFeedbackLogs(text: string): string {
  if (!text) return text;
  let s = text;

  s = s.replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi, "Bearer [REDACTED]");
  s = s.replace(/\bBasic\s+[A-Za-z0-9+/=]+\b/gi, "Basic [REDACTED]");

  s = s.replace(
    /("(?:password|passwd|secret|apiKey|api_key|accessToken|refreshToken|idToken|clientSecret|privateKey|cookie|set-cookie|authorization)"\s*:\s*")[^"]*(")/gi,
    "$1[REDACTED]$2"
  );
  s = s.replace(
    /('(?:password|passwd|secret|apiKey|api_key)'\s*:\s*')[^']*(')/gi,
    "$1[REDACTED]$2"
  );

  s = s.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]");

  s = s.replace(/\bsk-[a-zA-Z0-9]{20,}\b/g, "sk-[REDACTED]");
  s = s.replace(/\bsk_live_[a-zA-Z0-9]+\b/g, "sk_live_[REDACTED]");
  s = s.replace(/\bsk_test_[a-zA-Z0-9]+\b/g, "sk_test_[REDACTED]");
  s = s.replace(/\bwhsec_[a-zA-Z0-9]+\b/g, "whsec_[REDACTED]");
  s = s.replace(/\bxox[baprs]-[a-zA-Z0-9-]+\b/gi, "xox[REDACTED]");

  s = s.replace(/\bAKIA[0-9A-Z]{16}\b/g, "AKIA[REDACTED]");
  s = s.replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/gi, "gh[REDACTED]");

  s = s.replace(
    /([?&](?:access_token|refresh_token|id_token|password|secret)=)[^&\s"']+/gi,
    "$1[REDACTED]"
  );

  return s;
}

const urlPattern =
  /\b(?:https?|redis|rediss|postgres(?:ql)?):\/\/[^\s"'<>]+/giu;
const bearerPattern = /\bBearer\s+[^\s,"'<>]+/giu;
const jwtPattern =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu;
const secretAssignmentPattern =
  /\b(authorization|access[_-]?token|refresh[_-]?token|token|signature|secret|password|x-amz-[a-z0-9-]+)\s*[:=]\s*([^\s,;"'<>]+)/giu;
const userObjectKeyPattern = /\busers\/[^\s,"'<>]+/giu;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const phonePattern = /(?<!\d)1[3-9]\d{9}(?!\d)/gu;
const opaqueSecretPattern =
  /\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/gu;

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  }).join("");
}

export function sanitizeDiagnosticMessage(
  value: unknown,
  maximumLength = 500,
): string {
  const raw =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : "unknown error";
  const sanitized = replaceControlCharacters(raw)
    .replace(urlPattern, "[redacted-url]")
    .replace(bearerPattern, "Bearer [redacted]")
    .replace(jwtPattern, "[redacted-token]")
    .replace(
      secretAssignmentPattern,
      (_match, name: string) => `${name}=[redacted]`,
    )
    .replace(userObjectKeyPattern, "[redacted-object-key]")
    .replace(emailPattern, "[redacted-email]")
    .replace(phonePattern, "[redacted-phone]")
    .replace(opaqueSecretPattern, "[redacted-token]")
    .replace(/\s+/gu, " ")
    .trim();
  const limit = Math.max(1, Math.min(2_000, Math.floor(maximumLength)));
  return (sanitized || "unknown error").slice(0, limit);
}

export function sanitizeHttpPath(rawPath: string): string {
  const path = rawPath.split(/[?#]/u, 1)[0] || "/";
  return path
    .split("/")
    .map((segment, index, segments) => {
      if (
        segments[index - 1] === "shares" ||
        /^[A-Za-z0-9_-]{40,60}$/u.test(segment)
      ) {
        return ":shareToken";
      }
      return segment;
    })
    .join("/");
}

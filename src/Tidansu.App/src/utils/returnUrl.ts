/**
 * Returns `raw` only when it is a safe in-app destination: a path rooted at a
 * single "/" — not "//" or "/\", which browsers treat as protocol-relative and
 * can redirect off-site, and not an absolute "http(s)://" URL. Anything else
 * (absolute URLs, arrays, null/undefined) yields undefined so callers fall back
 * to their default route.
 *
 * Pure and dependency-free so it can be unit-tested directly once a test runner
 * is added (see audit finding C1).
 */
export function safeReturnUrl(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    if (!raw.startsWith('/')) return undefined;
    if (raw.startsWith('//') || raw.startsWith('/\\')) return undefined;
    return raw;
}

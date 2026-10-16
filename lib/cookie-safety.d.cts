export function applyResponseCookies(
  values: Array<{ name: string; value: string; options?: Record<string, unknown> }>,
  store: { set(name: string, value: string, options?: Record<string, unknown>): unknown },
): void;

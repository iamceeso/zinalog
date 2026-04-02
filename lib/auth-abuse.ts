const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 10;
const MFA_WINDOW_MS = 10 * 60 * 1000;
const MFA_ATTEMPT_LIMIT = 5;

type Entry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Entry>();

function registerAttempt(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  entry.count += 1;
  return entry.count <= limit;
}

function clear(keys: string[]): void {
  for (const key of keys) {
    store.delete(key);
  }
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function consumeLoginAttempt(
  ipAddress: string,
  username: string,
): boolean {
  const normalizedUsername = normalizeUsername(username);
  return (
    registerAttempt(`login:ip:${ipAddress}`, LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS) &&
    registerAttempt(
      `login:user:${normalizedUsername}`,
      LOGIN_ATTEMPT_LIMIT,
      LOGIN_WINDOW_MS,
    )
  );
}

export function clearLoginAttempts(ipAddress: string, username: string): void {
  clear([`login:ip:${ipAddress}`, `login:user:${normalizeUsername(username)}`]);
}

export function consumeMfaAttempt(
  ipAddress: string,
  challengeTokenHash: string,
): boolean {
  return (
    registerAttempt(`mfa:ip:${ipAddress}`, MFA_ATTEMPT_LIMIT, MFA_WINDOW_MS) &&
    registerAttempt(
      `mfa:challenge:${challengeTokenHash}`,
      MFA_ATTEMPT_LIMIT,
      MFA_WINDOW_MS,
    )
  );
}

export function clearMfaAttempts(
  ipAddress: string,
  challengeTokenHash: string,
): void {
  clear([`mfa:ip:${ipAddress}`, `mfa:challenge:${challengeTokenHash}`]);
}

export function resetAuthAbuseStore(): void {
  store.clear();
}

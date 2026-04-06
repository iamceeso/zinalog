const FALLBACK_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.APP_VERSION ?? "dev";

const FALLBACK_COMMIT =
  process.env.NEXT_PUBLIC_APP_COMMIT_SHA ??
  process.env.APP_COMMIT_SHA ??
  "local";

function normalizeCommit(commit: string): string {
  return commit.trim().slice(0, 7) || "local";
}

export const APP_VERSION = FALLBACK_VERSION;
export const APP_COMMIT_SHA = FALLBACK_COMMIT;
export const APP_VERSION_LABEL =
  APP_COMMIT_SHA === "local"
    ? APP_VERSION
    : `${APP_VERSION} (${normalizeCommit(APP_COMMIT_SHA)})`;

// Runtime app info injected by each client (web / desktop) at boot.
// The shared Settings → About panel reads it so each client can show
// its own real version instead of a hardcoded string.

let appVersion = 'unknown';

/** Set the app version shown in Settings → About. Call once at app boot. */
export function setAppVersion(version: string): void {
  appVersion = version;
}

/** Version of the running client (web or desktop). */
export function getAppVersion(): string {
  return appVersion;
}

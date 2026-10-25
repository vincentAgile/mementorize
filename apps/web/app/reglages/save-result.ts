/**
 * What saving a setting gives (MEM-79): saved; not saved because the value
 * is invalid (the message says why, the input stays to be corrected); or
 * not saved because of the server (the setting goes back to its value).
 */
export type SaveResult = { ok: true } | { invalid: string } | { failed: string };

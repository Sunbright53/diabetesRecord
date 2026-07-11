// Backend emits naive UTC ISO strings (no 'Z' suffix). JS would parse those as
// local time, so we force UTC unless a tz suffix is already present.
export function parseServerTime(iso: string): Date {
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasTz ? iso : iso + "Z");
}

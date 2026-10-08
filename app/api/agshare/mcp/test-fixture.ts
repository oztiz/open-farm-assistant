// Fixtures are permitted only on the named, isolated Supabase test project.
export function testFixturesEnabled() {
  return process.env.AGSHARE_TEST_FIXTURES === "true" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === "https://ovrtuhbuhnxiofmqosou.supabase.co";
}
export const TEST_FIELD = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Testskifte (syntetisk)",
  latitude: 0, longitude: 0, isPublic: false,
  boundaries: [[{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.001 },
    { latitude: 0.001, longitude: 0.001 }, { latitude: 0.001, longitude: 0 }]],
  abLines: [{ name: "Test AB (syntetisk)", type: "AB", coords: [
    { latitude: 0, longitude: 0 }, { latitude: 0.001, longitude: 0 }] }],
  updatedAt: "2026-10-08T00:00:00Z",
};
export function testResponse(path: string, method: string): unknown {
  if (method !== "GET") throw new Error("Test connection is read-only");
  if (path === "/api/fields") return [structuredClone(TEST_FIELD)];
  if (path === "/api/fields/" + TEST_FIELD.id) return structuredClone(TEST_FIELD);
  throw new Error("Test field not found");
}

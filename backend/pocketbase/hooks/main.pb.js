// VibeVision PocketBase JS hooks (empty by default).
// Files here are loaded by PocketBase at boot; see https://pocketbase.io/docs/js-vm/
routerAdd("GET", "/api/vibevision/health", (c) => {
  return c.json(200, { app: "vibevision", status: "ok" });
});
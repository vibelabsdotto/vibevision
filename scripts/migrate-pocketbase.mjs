#!/usr/bin/env node
/**
 * VibeVision PocketBase migration script.
 *
 * Idempotent by design: creates collections/fields/records only when missing,
 * the final step of every run is verification output, not the mutation log.
 *
 * Env:
 *   PB_URL              e.g. http://127.0.0.1:8090 (local) or https://vision-pb.vibelabs.to
 *   PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD  superuser creds (created on first run via bootstrap)
 *
 * The users collection is PocketBase's built-in auth collection — this script
 * only toggles its options (emailAuth, create rule) and creates the first user.
 */

const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";
// single-user app: every write and read requires an authenticated app user
const AUTH_RULE = '@request.auth.id != ""';
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL ?? "admin@vibelabs.local";
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD ?? "";
const APP_USER_EMAIL = process.env.VV_USER_EMAIL ?? "";
const APP_USER_PASSWORD = process.env.VV_USER_PASSWORD ?? "";

if (!ADMIN_PASSWORD) {
  console.error("PB_ADMIN_PASSWORD is required");
  process.exit(1);
}

// ---------------------------------------------------------------- helpers

async function api(path, options = {}, token = null) {
  const response = await fetch(`${PB_URL}/api/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`${options.method ?? "GET"} ${path} -> ${response.status}`);
    error.status = response.status;
    error.response = body;
    throw error;
  }
  return body;
}

function fieldsEqual(current, wanted) {
  return JSON.stringify(current) === JSON.stringify(wanted);
}

// ---------------------------------------------------------------- schema

const COLLECTIONS = [
  {
    name: "cycles",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [
      { type: "text", name: "slug", required: true, presentable: true },
      { type: "text", name: "title", required: true },
      { type: "text", name: "vision" },
      { type: "text", name: "startDate", required: true },
      { type: "text", name: "endDate", required: true },
      { type: "select", name: "status", values: ["planned", "active", "done"], maxSelect: 1, required: true },
      { type: "date", name: "capturedAt" }
    ],
    indexes: "CREATE UNIQUE INDEX idx_cycles_slug ON cycles (slug)"
  },
  {
    name: "cycle_weeks",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [
      { type: "relation", name: "cycle", required: true, collectionId: "cycles", maxSelect: 1, cascadeDelete: true },
      { type: "number", name: "weekNumber", required: false },
      { type: "text", name: "startDate", required: true },
      { type: "text", name: "endDate", required: true },
      { type: "text", name: "label", required: true }
    ],
    indexes:
      "CREATE UNIQUE INDEX idx_cycle_weeks_cycle_week ON cycle_weeks (cycle, weekNumber)"
  },
  {
    name: "goals",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [
      { type: "relation", name: "cycle", required: true, collectionId: "cycles", maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "title", required: true },
      { type: "text", name: "description" },
      { type: "number", name: "sortOrder", required: false },
      { type: "select", name: "status", values: ["in_progress", "achieved", "dropped"], maxSelect: 1, required: true }
    ],
    indexes: "CREATE INDEX idx_goals_cycle ON goals (cycle)"
  },
  {
    name: "lag_indicators",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [
      { type: "relation", name: "goal", required: true, collectionId: "goals", maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "title", required: true },
      { type: "select", name: "type", values: ["number", "boolean", "milestone", "text", "quantity"], maxSelect: 1 },
      { type: "number", name: "targetValue", required: false },
      { type: "number", name: "currentValue" },
      { type: "text", name: "unit" },
      { type: "bool", name: "achieved", required: false },
      { type: "number", name: "sortOrder", required: false }
    ],
    indexes: "CREATE INDEX idx_lags_goal ON lag_indicators (goal)"
  },
  {
    name: "tactics",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [
      { type: "relation", name: "goal", required: true, collectionId: "goals", maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "title", required: true },
      { type: "text", name: "type", required: true },
      { type: "select", name: "trackingType", values: ["boolean", "quantity", "duration"], maxSelect: 1, required: true },
      { type: "select", name: "recurrenceType", values: ["daily", "weekdays", "times_per_week", "once"], maxSelect: 1, required: true },
      { type: "number", name: "recurrenceCount", required: false },
      { type: "number", name: "targetValue", required: false },
      { type: "text", name: "unit", required: true },
      { type: "number", name: "targetPerWeek" },
      { type: "number", name: "targetPerDay" },
      { type: "number", name: "scoringWeight", required: false },
      { type: "number", name: "startsWeek" },
      { type: "number", name: "endsWeek" },
      { type: "bool", name: "active", required: false },
      { type: "number", name: "sortOrder", required: false }
    ],
    indexes: "CREATE INDEX idx_tactics_goal ON tactics (goal)"
  },
  {
    name: "tactic_schedules",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [
      { type: "relation", name: "tactic", required: true, collectionId: "tactics", maxSelect: 1, cascadeDelete: true },
      { type: "number", name: "weekNumber", required: false },
      { type: "number", name: "plannedTarget" },
      { type: "bool", name: "required" }
    ],
    indexes:
      "CREATE UNIQUE INDEX idx_tactic_schedules_tactic_week ON tactic_schedules (tactic, weekNumber)"
  },
  {
    name: "tactic_calendar_blocks",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [
      { type: "relation", name: "tactic", required: true, collectionId: "tactics", maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "cycle", required: true, collectionId: "cycles", maxSelect: 1, cascadeDelete: true },
      { type: "number", name: "weekNumber", required: false },
      { type: "text", name: "date", required: true },
      { type: "text", name: "startTime" },
      { type: "text", name: "endTime" },
      { type: "number", name: "durationMinutes" },
      { type: "number", name: "plannedValue", required: false },
      { type: "text", name: "note" }
    ],
    indexes: "CREATE INDEX idx_blocks_cycle_week ON tactic_calendar_blocks (cycle, weekNumber)"
  },
  {
    name: "daily_logs",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [
      { type: "relation", name: "cycle", required: true, collectionId: "cycles", maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "date", required: true },
      { type: "text", name: "oneThing" },
      { type: "bool", name: "morningDone", required: false },
      { type: "bool", name: "eveningDone", required: false },
      { type: "number", name: "stressLevel" },
      { type: "number", name: "agencyScore" },
      { type: "bool", name: "comfortZoneDone", required: false },
      { type: "number", name: "deepWorkMinutes", required: false },
      { type: "text", name: "avoidanceTrigger" },
      { type: "text", name: "privateVictories" },
      { type: "text", name: "notes" }
    ],
    indexes: "CREATE UNIQUE INDEX idx_daily_logs_cycle_date ON daily_logs (cycle, date)"
  },
  {
    name: "tactic_entries",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [
      { name: "tactic", required: true, collectionId: "tactics", maxSelect: 1, cascadeDelete: true, type: "relation" },
      { name: "cycle", required: true, collectionId: "cycles", maxSelect: 1, cascadeDelete: true, type: "relation" },
      { name: "weekNumber", type: "number", required: false },
      { name: "date", type: "text" },
      { name: "value", type: "number", required: false },
      { name: "completed", type: "bool", required: false },
      { name: "note", type: "text" }
    ],
    indexes: "CREATE INDEX idx_tactic_entries_cycle_week ON tactic_entries (cycle, weekNumber)"
  },
  {
    name: "week_snapshots",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [
      { type: "relation", name: "cycle", required: true, collectionId: "cycles", maxSelect: 1, cascadeDelete: true },
      { type: "number", name: "weekNumber", required: false },
      { type: "text", name: "snapshotJson", required: true, maxSize: 2_000_000 },
      { type: "text", name: "capturedAt", required: true }
    ],
    indexes: "CREATE INDEX idx_week_snapshots_cycle_week ON week_snapshots (cycle, weekNumber)"
  },
  {
    name: "weekly_reviews",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [
      { type: "relation", name: "cycle", required: true, collectionId: "cycles", maxSelect: 1, cascadeDelete: true },
      { type: "number", name: "weekNumber", required: false },
      { type: "number", name: "executionScore" },
      { type: "text", name: "weeklyGoals", maxSize: 10000 },
      { type: "text", name: "wins", maxSize: 10000 },
      { type: "text", name: "misses", maxSize: 10000 },
      { type: "text", name: "avoidancePatterns", maxSize: 10000 },
      { type: "text", name: "lessons", maxSize: 10000 },
      { type: "text", name: "nextWeekAdjustments", maxSize: 10000 },
      { type: "text", name: "completedAt" }
    ],
    indexes: "CREATE UNIQUE INDEX idx_weekly_reviews_cycle_week ON weekly_reviews (cycle, weekNumber)"
  },
  {
    name: "monthly_reviews",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [
      { type: "relation", name: "cycle", required: true, collectionId: "cycles", maxSelect: 1, cascadeDelete: true },
      { type: "number", name: "monthNumber", required: true },
      { type: "text", name: "title", required: true },
      { type: "text", name: "reflection", maxSize: 20000 },
      { type: "text", name: "adjustments", maxSize: 20000 }
    ],
    indexes:
      "CREATE UNIQUE INDEX idx_monthly_reviews_cycle_month ON monthly_reviews (cycle, monthNumber)"
  },
  {
    name: "events",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [
      { type: "relation", name: "cycle", collectionId: "cycles", maxSelect: 1, cascadeDelete: true, required: false },
      { type: "text", name: "type", required: true },
      { type: "text", name: "payloadJson", maxSize: 50000 }
    ],
    indexes: "CREATE INDEX idx_events_cycle ON events (cycle)"
  },
  {
    name: "settings",
    listRule: AUTH_RULE,
    viewRule: AUTH_RULE,
    createRule: AUTH_RULE,
    updateRule: AUTH_RULE,
    deleteRule: AUTH_RULE,
    fields: [{ type: "text", name: "key", required: true }, { type: "text", name: "value", required: true }],
    indexes: "CREATE UNIQUE INDEX idx_settings_key ON settings (key)"
  }
];

// ---------------------------------------------------------------- bootstrap

async function ensureSuperuser() {
  // health check — is PB reachable
  await api("health", {});

  // try to auth directly; on failure, try to create the first superuser
  // (only possible when the instance has no superusers yet: _superusers count == 0)
  try {
    const auth = await api(
      "collections/_superusers/auth-with-password",
      { method: "POST", body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }) }
    );
    return auth.token;
  } catch (error) {
    if (error.status !== 400 && error.status !== 401 && error.status !== 404) throw error;
  }

  // first-run bootstrap: create superuser account (allowed only when none exists)
  const admins = await api("collections/_superusers/records", {}, null);
  if (admins.totalItems > 0) {
    throw new Error("Superuser exists but the given credentials do not match.");
  }
  const created = await api(
    "collections/_superusers/records",
    { method: "POST", body: JSON.stringify({ email: ADMIN_EMAIL, password: APP_USER_PASSWORD || ADMIN_PASSWORD, passwordConfirm: APP_USER_PASSWORD || ADMIN_PASSWORD }) },
    null
  );
  const auth = await api(
    "collections/_superusers/admins/auth-with-password",
    { method: "POST", body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }) }
  );
  return auth.token;
}

// ---------------------------------------------------------------- main

async function ensureCollection(adminToken, spec, collectionIdMap) {
  const existing = await api(`collections/${spec.name}`, {}, adminToken).catch(() => null);

  if (existing) {
    // sync field definitions: add missing fields, align changed flags (e.g. required)
    const specByName = new Map(spec.fields.map((field) => [field.name, field]));
    let changed = false;
    const mergedFields = existing.fields.map((field) => {
      const wanted = specByName.get(field.name);
      if (!wanted) return field;
      const normalized = { ...wanted };
      if (normalized.collectionId && collectionIdMap[normalized.collectionId]) {
        normalized.collectionId = collectionIdMap[normalized.collectionId];
      }
      const diffs = {};
      for (const key of ["required", "values", "maxSelect", "maxSize", "cascadeDelete", "hidden", "presentable"]) {
        if (key in normalized && JSON.stringify(field[key]) !== JSON.stringify(normalized[key])) {
          diffs[key] = normalized[key];
        }
      }
      if (Object.keys(diffs).length > 0) {
        changed = true;
        return { ...field, ...diffs };
      }
      return field;
    });
  const currentFieldNames = new Set(existing.fields.map((field) => field.name));
    const missingFields = spec.fields.filter((field) => !currentFieldNames.has(field.name));
    const ruleDiffs = {};
    for (const ruleKey of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
      if (JSON.stringify(existing[ruleKey]) !== JSON.stringify(spec[ruleKey])) {
        ruleDiffs[ruleKey] = spec[ruleKey];
      }
    }
    if (missingFields.length > 0 || changed || Object.keys(ruleDiffs).length > 0) {
      const body = {
        ...ruleDiffs,
        fields: [
          ...mergedFields,
          ...missingFields.map((field) => {
            const mapped = { ...field };
            if (mapped.collectionId && collectionIdMap[mapped.collectionId]) {
              mapped.collectionId = collectionIdMap[mapped.collectionId];
            }
            return mapped;
          })
        ]
      };
      await api(`collections/${spec.name}`, { method: "PATCH", body: JSON.stringify(body) }, adminToken);
      console.log(`  updated collection ${spec.name} (+${missingFields.length} fields${changed ? ", flags synced" : ""})`);
      return;
    }
    console.log(`  ok ${spec.name}`);
    return;
  }

  const body = {
    name: spec.name,
    type: "base",
    listRule: spec.listRule,
    viewRule: spec.viewRule,
    createRule: spec.createRule,
    updateRule: spec.updateRule,
    deleteRule: spec.deleteRule,
    fields: spec.fields.map((field) => {
      const mapped = { ...field };
      if (mapped.collectionId && collectionIdMap[mapped.collectionId]) {
        mapped.collectionId = collectionIdMap[mapped.collectionId];
        mapped.collectionName = null;
      }
      return mapped;
    }),
    indexes: spec.indexes ? [spec.indexes] : []
  };

  await api("collections", { method: "POST", body: JSON.stringify(body) }, adminToken);
  console.log(`  created ${spec.name}`);
}

async function ensureUsersOptions(adminToken) {
  const users = await api("collections/users", {}, adminToken);
  const patch = {};
  if (users.listRule !== "") patch.listRule = "";
  if (users.viewRule !== "") patch.viewRule = "";
  if (users.createRule !== null) patch.createRule = null;
  if (users.updateRule !== `id = @request.auth.id`) patch.updateRule = "id = @request.auth.id";
  if (users.deleteRule !== null) patch.deleteRule = null;
  if (Object.keys(patch).length) {
    await api("collections/users", { method: "PATCH", body: JSON.stringify(patch) }, adminToken);
    console.log("  updated users collection rules");
  } else {
    console.log("  ok users");
  }
}

async function ensureAppUser(adminToken) {
  if (!APP_USER_EMAIL || !APP_USER_PASSWORD) {
    console.log("  skip app user (VV_USER_EMAIL/VV_USER_PASSWORD not set)");
    return;
  }
  const existing = await api(
    `collections/users/records?filter=${encodeURIComponent(`email = "${APP_USER_EMAIL}"`)}`,
    {},
    adminToken
  );
  if (existing.totalItems > 0) {
    console.log(`  ok user ${APP_USER_EMAIL}`);
    return;
  }
  await api(
    "collections/users/records",
    { method: "POST", body: JSON.stringify({ email: APP_USER_EMAIL, password: APP_USER_PASSWORD, passwordConfirm: APP_USER_PASSWORD }) },
    adminToken
  );
  console.log(`  created user ${APP_USER_EMAIL}`);
}

async function verify(adminToken) {
  const list = await api("collections?perPage=200", {}, adminToken);
  const names = new Set(list.items.map((collection) => collection.name));
  const expected = ["users", ...COLLECTIONS.map((collection) => collection.name)];
  const missing = COLLECTIONS.filter((collection) => !names.has(collection.name));
  if (missing.length) {
    throw new Error(`Verification failed, missing collections: ${missing.map((m) => m.name).join(", ")}`);
  }
  console.log(`verify: ${expected.length} collections present (${[...names].length} total)`);

  // authenticated app-user probe (list rules require auth now)
  const usersAuth = await api(
    "collections/users/auth-with-password",
    { method: "POST", body: JSON.stringify({ identity: APP_USER_EMAIL || ADMIN_EMAIL, password: APP_USER_PASSWORD || ADMIN_PASSWORD }) },
    null
  ).catch(() => null);
  if (!usersAuth) {
    throw new Error("cannot verify: no app user credentials available (set VV_USER_EMAIL/VV_USER_PASSWORD)");
  }
  for (const name of ["cycles", "tactics", "daily_logs"]) {
    const probe = await api(`collections/${name}/records?perPage=1`, {}, usersAuth.token);
    if (typeof probe.totalItems !== "number") throw new Error(`authed read probe failed for ${name}`);
  }
  console.log("verify: authenticated app-user read OK (rules are @request.auth.id based)");

  // anonymous must not see any records (PB list rules filter records instead of erroring)
  const anonProbe = await api(`collections/cycles/records?perPage=50`, {}, null);
  if (Number(anonProbe.totalItems ?? 0) > 0) {
    throw new Error("anonymous list returned records — listRule is not auth-gated");
  }
  const superCycles = await api(`collections/cycles/records?perPage=1`, {}, adminToken);
  console.log(`verify: anonymous sees ${Number(anonProbe.totalItems ?? 0)} cycles, superuser sees ${Number(superCycles.totalItems)} — rules gate reads correctly`);
}

async function main() {
  console.log(`PocketBase migration → ${PB_URL}`);
  const token = await ensureSuperuser();
  console.log("auth ok");

  // two-pass: create base collections first, then relations can resolve ids
  const collectionIdMap = {};
  for (const spec of COLLECTIONS) {
    const created = await api(`collections/${spec.name}`, {}, token).catch(() => null);
    if (created) collectionIdMap[spec.name] = created.id;
  }
  for (const spec of COLLECTIONS) {
    await ensureCollection(token, spec, collectionIdMap);
    const created = await api(`collections/${spec.name}`, {}, token).catch(() => null);
    if (created) collectionIdMap[spec.name] = created.id;
  }

  await ensureUsersOptions(token);
  await ensureAppUser(token);
  await verify(token);
  console.log("migration complete");
}

main().catch((error) => {
  console.error("migration failed:", error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  process.exit(1);
});
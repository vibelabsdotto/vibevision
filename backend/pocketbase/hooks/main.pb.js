// VibeVision PocketBase JS hooks.
// Files here are loaded by PocketBase at boot; see https://pocketbase.io/docs/js-vm/
routerAdd("GET", "/api/vibevision/health", (c) => {
  return c.json(200, { app: "vibevision", status: "ok" });
});

// Execute hooks run inside PocketBase's wrapping save transaction. Keep every
// helper inside the handler because PocketBase serializes handlers in isolation.
function validateCalendarBlock(e) {
  function normalizeAmount(value) {
    var scale = 1000000;
    return Math.round(value * scale) / scale;
  }

  function numberField(record, name, fallback) {
    var raw;
    if (typeof record.get === "function") {
      raw = record.get(name);
      if (raw === null || typeof raw === "undefined" || raw === "") {
        return fallback;
      }
    } else {
      raw = record.getFloat(name);
    }

    var value = Number(raw);
    return isFinite(value) ? value : fallback;
  }

  function weeklyTarget(tactic) {
    var trackingType = tactic.getString("trackingType");
    var recurrenceType = tactic.getString("recurrenceType");

    // Prefer the current tactic model when populated.
    if (trackingType && recurrenceType) {
      var targetValue = numberField(tactic, "targetValue", 1);
      var recurrenceCount = Math.max(1, numberField(tactic, "recurrenceCount", 1));
      if (recurrenceType === "daily") return targetValue * 7;
      if (recurrenceType === "weekdays") return targetValue * 5;
      if (recurrenceType === "times_per_week") return targetValue * recurrenceCount;
      if (recurrenceType === "once") return targetValue;
      return 0;
    }

    // Legacy tactics remain schedulable without a data backfill.
    var type = tactic.getString("type");
    if (type === "weekly_hours" || type === "weekly_count") {
      return numberField(tactic, "targetPerWeek", 0);
    }
    if (type === "daily_checkbox") {
      return numberField(tactic, "targetPerDay", 1) * 7;
    }
    if (type === "one_time") return 1;
    if (type === "habit") {
      var targetPerWeek = numberField(tactic, "targetPerWeek", 0);
      return targetPerWeek >= 7 ? 7 : Math.max(1, targetPerWeek);
    }
    return 1;
  }

  var rawValue = numberField(e.record, "plannedValue", 0);
  var plannedValue = normalizeAmount(rawValue);
  if (!isFinite(rawValue) || plannedValue <= 0) {
    throw new BadRequestError("Block size must be greater than 0");
  }

  var tacticId = e.record.getString("tactic");
  var tactic = e.app.findRecordById("tactics", tacticId);
  if (tactic.getString("executionStyle") === "occurrence" && Math.floor(plannedValue) !== plannedValue) {
    throw new BadRequestError("Occurrence block size must be a whole number");
  }

  var cycleId = e.record.getString("cycle");
  var weekNumber = e.record.getInt("weekNumber");
  var blocks = e.app.findRecordsByFilter(
    "tactic_calendar_blocks",
    "tactic = {:tactic} && cycle = {:cycle} && weekNumber = {:week} && id != {:id}",
    "",
    0,
    0,
    { tactic: tacticId, cycle: cycleId, week: weekNumber, id: e.record.id }
  );

  var scheduled = 0;
  for (var i = 0; i < blocks.length; i += 1) {
    if (blocks[i].id === e.record.id) continue;
    var blockValue = numberField(blocks[i], "plannedValue", 0);
    if (blockValue > 0) scheduled += blockValue;
  }

  var target = normalizeAmount(weeklyTarget(tactic));
  var remaining = normalizeAmount(Math.max(target - normalizeAmount(scheduled), 0));
  if (plannedValue > remaining) {
    var unit = tactic.getString("unit") || "units";
    throw new BadRequestError(
      "Only " + String(remaining) + " " + unit + " remain to schedule this week"
    );
  }

  e.next();
}

onRecordCreateExecute(validateCalendarBlock, "tactic_calendar_blocks");
onRecordUpdateExecute(validateCalendarBlock, "tactic_calendar_blocks");

// VibeVision PocketBase JS hooks.
// Files here are loaded by PocketBase at boot; see https://pocketbase.io/docs/js-vm/
routerAdd("GET", "/api/vibevision/health", (c) => {
  return c.json(200, { app: "vibevision", status: "ok" });
});

// PocketBase serializes each execute handler into an isolated JSVM runtime.
// Keep every helper inside the handler so the real runtime matches the tests.
function calendarExecute(e) {
  var scale = 1000000;

  function normalize(value) {
    return Math.round(Number(value) * scale) / scale;
  }

  function numberField(record, name, fallback) {
    var raw = typeof record.get === "function" ? record.get(name) : record.getFloat(name);
    if (raw === null || typeof raw === "undefined" || raw === "") return fallback;
    var value = Number(raw);
    return isFinite(value) ? value : fallback;
  }

  function findRecords(app, collection, filter, params) {
    return app.findRecordsByFilter(collection, filter, "", 0, 0, params);
  }

  function resolvePlan(tactic) {
    var trackingType = tactic.getString("trackingType");
    var recurrenceType = tactic.getString("recurrenceType");
    var type = tactic.getString("type");
    var targetValue;
    var recurrenceCount;

    if (!trackingType || !recurrenceType) {
      if (type === "daily_checkbox") {
        trackingType = "boolean";
        recurrenceType = "daily";
        targetValue = numberField(tactic, "targetPerDay", 1);
        recurrenceCount = 1;
      } else if (type === "weekly_hours") {
        trackingType = "duration";
        recurrenceType = "times_per_week";
        targetValue = numberField(tactic, "targetPerWeek", 0);
        recurrenceCount = 1;
      } else if (type === "weekly_count") {
        trackingType = "quantity";
        recurrenceType = "times_per_week";
        targetValue = numberField(tactic, "targetPerWeek", 0);
        recurrenceCount = 1;
      } else if (type === "habit") {
        trackingType = "boolean";
        recurrenceType = "times_per_week";
        targetValue = 1;
        recurrenceCount = numberField(tactic, "targetPerWeek", 0);
      } else if (type === "one_time") {
        trackingType = "boolean";
        recurrenceType = "once";
        targetValue = 1;
        recurrenceCount = 1;
      }
    }

    if (trackingType !== "boolean" && trackingType !== "quantity" && trackingType !== "duration") {
      throw new BadRequestError("Invalid tactic plan");
    }
    if (
      recurrenceType !== "daily" &&
      recurrenceType !== "weekdays" &&
      recurrenceType !== "times_per_week" &&
      recurrenceType !== "once"
    ) {
      throw new BadRequestError("Invalid tactic plan");
    }
    if (typeof targetValue === "undefined") targetValue = numberField(tactic, "targetValue", 0);
    if (typeof recurrenceCount === "undefined") recurrenceCount = numberField(tactic, "recurrenceCount", 1);
    targetValue = normalize(targetValue);
    recurrenceCount = Number(recurrenceCount);
    if (targetValue <= 0 || !isFinite(recurrenceCount) || recurrenceCount <= 0) {
      throw new BadRequestError("Invalid tactic plan");
    }
    if ((recurrenceType === "daily" || recurrenceType === "weekdays" || recurrenceType === "once") && recurrenceCount !== 1) {
      throw new BadRequestError("Invalid tactic plan");
    }
    if (trackingType === "boolean" && targetValue !== 1) {
      throw new BadRequestError("Invalid tactic plan");
    }
    return {
      trackingType: trackingType,
      recurrenceType: recurrenceType,
      recurrenceCount: recurrenceCount,
      targetValue: targetValue,
      unit: tactic.getString("unit") || "units"
    };
  }

  function resolveStyle(tactic, plan) {
    var provided = tactic.getString("executionStyle");
    var derived =
      plan.trackingType === "boolean"
        ? plan.recurrenceType === "daily" || plan.recurrenceType === "weekdays"
          ? "toggle"
          : "occurrence"
        : "volume";
    if (provided !== "toggle" && provided !== "occurrence" && provided !== "volume") return derived;
    var valid =
      (provided === "toggle" && plan.trackingType === "boolean") ||
      (provided === "occurrence" &&
        (plan.trackingType === "boolean" ||
          (plan.trackingType === "quantity" && Math.floor(plan.targetValue) === plan.targetValue))) ||
      (provided === "volume" && (plan.trackingType === "quantity" || plan.trackingType === "duration"));
    if (!valid) throw new BadRequestError("Invalid execution style for tactic");
    return provided;
  }

  function getBaseTarget(plan) {
    if (plan.recurrenceType === "daily") return normalize(plan.targetValue * 7);
    if (plan.recurrenceType === "weekdays") return normalize(plan.targetValue * 5);
    if (plan.recurrenceType === "times_per_week") {
      return normalize(plan.targetValue * plan.recurrenceCount);
    }
    return normalize(plan.targetValue);
  }

  function getWeeklyTarget(app, tacticId, weekNumber, plan) {
    var schedules = findRecords(
      app,
      "tactic_schedules",
      "tactic = {:tactic} && weekNumber = {:week}",
      { tactic: tacticId, week: weekNumber }
    );
    if (schedules.length === 0) return getBaseTarget(plan);
    var raw = typeof schedules[0].get === "function"
      ? schedules[0].get("plannedTarget")
      : schedules[0].getFloat("plannedTarget");
    if (raw === null || typeof raw === "undefined" || raw === "") return getBaseTarget(plan);
    var target = normalize(Number(raw));
    if (!isFinite(target) || target < 0) throw new BadRequestError("Invalid weekly target");
    return target;
  }

  function getBucket(app, tacticId, date) {
    var tactic = app.findRecordById("tactics", tacticId);
    var goal = app.findRecordById("goals", tactic.getString("goal"));
    var cycleId = goal.getString("cycle");
    var weeks = findRecords(
      app,
      "cycle_weeks",
      "cycle = {:cycle} && startDate <= {:date} && endDate >= {:date}",
      { cycle: cycleId, date: date }
    );
    if (weeks.length !== 1) throw new BadRequestError("Date is not inside the tactic cycle");
    return {
      tactic: tactic,
      cycleId: cycleId,
      weekNumber: weeks[0].getInt("weekNumber")
    };
  }

  var originalApp = e.app;
  return originalApp.runInTransaction(function (txApp) {
    e.app = txApp;
    try {
      var rawValue = numberField(e.record, "plannedValue", 0);
      var plannedValue = normalize(rawValue);
      if (!isFinite(rawValue) || plannedValue <= 0) {
        throw new BadRequestError("Block size must be greater than 0");
      }

      var tacticId = e.record.getString("tactic");
      var date = e.record.getString("date");
      var bucket = getBucket(e.app, tacticId, date);
      if (e.record.getString("cycle") !== bucket.cycleId) {
        throw new BadRequestError("Calendar block cycle does not match its tactic");
      }
      if (e.record.getInt("weekNumber") !== bucket.weekNumber) {
        throw new BadRequestError("Calendar block week does not match its date");
      }

      var plan = resolvePlan(bucket.tactic);
      var style = resolveStyle(bucket.tactic, plan);
      if (style === "toggle") throw new BadRequestError("Toggles can't be scheduled");
      if (style === "occurrence" && Math.floor(plannedValue) !== plannedValue) {
        throw new BadRequestError("Occurrence block size must be a whole number");
      }
      e.record.set("plannedValue", plannedValue);

      var blocks = findRecords(
        e.app,
        "tactic_calendar_blocks",
        "tactic = {:tactic} && cycle = {:cycle} && weekNumber = {:week} && id != {:id}",
        { tactic: tacticId, cycle: bucket.cycleId, week: bucket.weekNumber, id: e.record.id }
      );
      var scheduled = 0;
      for (var i = 0; i < blocks.length; i += 1) {
        var blockValue = normalize(numberField(blocks[i], "plannedValue", 0));
        if (blockValue > 0) scheduled = normalize(scheduled + blockValue);
      }

      var target = getWeeklyTarget(e.app, tacticId, bucket.weekNumber, plan);
      var remaining = normalize(Math.max(target - scheduled, 0));
      if (plannedValue > remaining) {
        throw new BadRequestError(
          "Only " + String(remaining) + " " + plan.unit + " remain to schedule this week"
        );
      }
      e.next();
    } finally {
      e.app = originalApp;
    }
  });
}

function entryCreateOrUpdateExecute(e) {
  var scale = 1000000;

  function normalize(value) {
    return Math.round(Number(value) * scale) / scale;
  }

  function numberField(record, name, fallback) {
    var raw = typeof record.get === "function" ? record.get(name) : record.getFloat(name);
    if (raw === null || typeof raw === "undefined" || raw === "") return fallback;
    var value = Number(raw);
    return isFinite(value) ? value : fallback;
  }

  function findRecords(app, collection, filter, params) {
    return app.findRecordsByFilter(collection, filter, "", 0, 0, params);
  }

  function resolvePlan(tactic) {
    var trackingType = tactic.getString("trackingType");
    var recurrenceType = tactic.getString("recurrenceType");
    var type = tactic.getString("type");
    var targetValue;
    var recurrenceCount;

    if (!trackingType || !recurrenceType) {
      if (type === "daily_checkbox") {
        trackingType = "boolean";
        recurrenceType = "daily";
        targetValue = numberField(tactic, "targetPerDay", 1);
        recurrenceCount = 1;
      } else if (type === "weekly_hours") {
        trackingType = "duration";
        recurrenceType = "times_per_week";
        targetValue = numberField(tactic, "targetPerWeek", 0);
        recurrenceCount = 1;
      } else if (type === "weekly_count") {
        trackingType = "quantity";
        recurrenceType = "times_per_week";
        targetValue = numberField(tactic, "targetPerWeek", 0);
        recurrenceCount = 1;
      } else if (type === "habit") {
        trackingType = "boolean";
        recurrenceType = "times_per_week";
        targetValue = 1;
        recurrenceCount = numberField(tactic, "targetPerWeek", 0);
      } else if (type === "one_time") {
        trackingType = "boolean";
        recurrenceType = "once";
        targetValue = 1;
        recurrenceCount = 1;
      }
    }

    if (trackingType !== "boolean" && trackingType !== "quantity" && trackingType !== "duration") {
      throw new BadRequestError("Invalid tactic plan");
    }
    if (
      recurrenceType !== "daily" &&
      recurrenceType !== "weekdays" &&
      recurrenceType !== "times_per_week" &&
      recurrenceType !== "once"
    ) {
      throw new BadRequestError("Invalid tactic plan");
    }
    if (typeof targetValue === "undefined") targetValue = numberField(tactic, "targetValue", 0);
    if (typeof recurrenceCount === "undefined") recurrenceCount = numberField(tactic, "recurrenceCount", 1);
    targetValue = normalize(targetValue);
    recurrenceCount = Number(recurrenceCount);
    if (targetValue <= 0 || !isFinite(recurrenceCount) || recurrenceCount <= 0) {
      throw new BadRequestError("Invalid tactic plan");
    }
    if ((recurrenceType === "daily" || recurrenceType === "weekdays" || recurrenceType === "once") && recurrenceCount !== 1) {
      throw new BadRequestError("Invalid tactic plan");
    }
    if (trackingType === "boolean" && targetValue !== 1) {
      throw new BadRequestError("Invalid tactic plan");
    }
    return {
      trackingType: trackingType,
      recurrenceType: recurrenceType,
      recurrenceCount: recurrenceCount,
      targetValue: targetValue,
      unit: tactic.getString("unit") || "units"
    };
  }

  function resolveStyle(tactic, plan) {
    var provided = tactic.getString("executionStyle");
    var derived =
      plan.trackingType === "boolean"
        ? plan.recurrenceType === "daily" || plan.recurrenceType === "weekdays"
          ? "toggle"
          : "occurrence"
        : "volume";
    if (provided !== "toggle" && provided !== "occurrence" && provided !== "volume") return derived;
    var valid =
      (provided === "toggle" && plan.trackingType === "boolean") ||
      (provided === "occurrence" &&
        (plan.trackingType === "boolean" ||
          (plan.trackingType === "quantity" && Math.floor(plan.targetValue) === plan.targetValue))) ||
      (provided === "volume" && (plan.trackingType === "quantity" || plan.trackingType === "duration"));
    if (!valid) throw new BadRequestError("Invalid execution style for tactic");
    return provided;
  }

  function getBucket(app, tacticId, date) {
    var tactic = app.findRecordById("tactics", tacticId);
    var goal = app.findRecordById("goals", tactic.getString("goal"));
    var cycleId = goal.getString("cycle");
    var weeks = findRecords(
      app,
      "cycle_weeks",
      "cycle = {:cycle} && startDate <= {:date} && endDate >= {:date}",
      { cycle: cycleId, date: date }
    );
    if (weeks.length !== 1) throw new BadRequestError("Date is not inside the tactic cycle");
    return {
      tactic: tactic,
      tacticId: tacticId,
      cycleId: cycleId,
      weekNumber: weeks[0].getInt("weekNumber"),
      date: date
    };
  }

  function getEntryValue(record, style) {
    var raw = numberField(record, "value", 0);
    var value = normalize(raw);
    if (!isFinite(raw)) throw new BadRequestError("Invalid tactic entry value");
    if (style === "toggle") {
      if (!(record.getBool("completed") || value > 0)) {
        throw new BadRequestError("Invalid tactic entry value");
      }
      return 1;
    }
    if (style === "occurrence") {
      if (record.getBool("completed") && value === 0) value = 1;
      if (value <= 0 || Math.floor(value) !== value) {
        throw new BadRequestError("Occurrence entry value must be a positive whole number");
      }
      return value;
    }
    if (value === 0) throw new BadRequestError("Invalid tactic entry value");
    return value;
  }

  function isWeekday(date) {
    var weekday = new Date(date + "T00:00:00.000Z").getUTCDay();
    return weekday >= 1 && weekday <= 5;
  }

  function getDailyTarget(app, bucket, plan) {
    var blocks = findRecords(
      app,
      "tactic_calendar_blocks",
      "tactic = {:tactic} && cycle = {:cycle} && weekNumber = {:week} && date = {:date}",
      { tactic: bucket.tacticId, cycle: bucket.cycleId, week: bucket.weekNumber, date: bucket.date }
    );
    var scheduled = 0;
    for (var i = 0; i < blocks.length; i += 1) {
      var value = normalize(numberField(blocks[i], "plannedValue", 0));
      if (value > 0) scheduled = normalize(scheduled + value);
    }
    if (scheduled > 0) return scheduled;
    if (plan.recurrenceType === "daily") return plan.targetValue;
    if (plan.recurrenceType === "weekdays" && isWeekday(bucket.date)) return plan.targetValue;
    return 0;
  }

  var originalApp = e.app;
  return originalApp.runInTransaction(function (txApp) {
    e.app = txApp;
    try {
      var tacticId = e.record.getString("tactic");
      var date = e.record.getString("date");
      var bucket = getBucket(e.app, tacticId, date);
      if (e.record.getString("cycle") !== bucket.cycleId) {
        throw new BadRequestError("Tactic entry cycle does not match its tactic");
      }
      if (e.record.getInt("weekNumber") !== bucket.weekNumber) {
        throw new BadRequestError("Tactic entry week does not match its date");
      }

      var plan = resolvePlan(bucket.tactic);
      var style = resolveStyle(bucket.tactic, plan);
      var records = findRecords(
        e.app,
        "tactic_entries",
        "tactic = {:tactic} && cycle = {:cycle} && weekNumber = {:week} && date = {:date} && id != {:id}",
        { tactic: tacticId, cycle: bucket.cycleId, week: bucket.weekNumber, date: date, id: e.record.id }
      );
      var actualBefore = 0;
      for (var i = 0; i < records.length; i += 1) {
        actualBefore = normalize(actualBefore + getEntryValue(records[i], style));
      }

      var value = getEntryValue(e.record, style);
      if (style !== "toggle") e.record.set("value", value);
      var projected = normalize(actualBefore + value);
      var target = normalize(getDailyTarget(e.app, bucket, plan));
      if (projected < 0) {
        throw new BadRequestError("Tactic progress cannot be negative for this date");
      }
      if (projected > target) {
        var remaining = normalize(Math.max(target - actualBefore, 0));
        throw new BadRequestError(
          "Only " + String(remaining) + " " + plan.unit + " remain for this date"
        );
      }
      e.next();
    } finally {
      e.app = originalApp;
    }
  });
}

function entryDeleteExecute(e) {
  var scale = 1000000;
  function normalize(value) {
    return Math.round(Number(value) * scale) / scale;
  }
  function numberField(record, name, fallback) {
    var raw = typeof record.get === "function" ? record.get(name) : record.getFloat(name);
    if (raw === null || typeof raw === "undefined" || raw === "") return fallback;
    var value = Number(raw);
    return isFinite(value) ? value : fallback;
  }

  var originalApp = e.app;
  return originalApp.runInTransaction(function (txApp) {
    e.app = txApp;
    try {
      if (normalize(numberField(e.record, "value", 0)) < 0) {
        throw new BadRequestError("Negative tactic entries cannot be deleted directly");
      }
      e.next();
    } finally {
      e.app = originalApp;
    }
  });
}

onRecordCreateExecute(calendarExecute, "tactic_calendar_blocks");
onRecordUpdateExecute(calendarExecute, "tactic_calendar_blocks");
onRecordCreateExecute(entryCreateOrUpdateExecute, "tactic_entries");
onRecordUpdateExecute(entryCreateOrUpdateExecute, "tactic_entries");
onRecordDeleteExecute(entryDeleteExecute, "tactic_entries");

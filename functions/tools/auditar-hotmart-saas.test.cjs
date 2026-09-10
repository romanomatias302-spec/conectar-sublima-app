"use strict";
/* eslint-disable require-jsdoc, max-len */

const test = require("node:test");
const assert = require("node:assert/strict");
const {classifyHotmartClient, parseArgs} = require("./auditar-hotmart-saas.cjs");

test("auditor sólo clasifica tenants Hotmart y no expone datos sensibles", () => {
  assert.equal(classifyHotmartClient("manual", {metodoCobro: "manual"}), null);
  const row = classifyHotmartClient("tenant", {
    billingProvider: "hotmart",
    hotmartSubscriptionId: "SUB-1",
    email: "private@example.com",
    logoUrl: "data:image/png;base64,abc",
  }, [{eventId: "event-1", reasons: ["INVALID_PLAN_ID"]}]);
  assert.equal(row.providerSubscriptionId, "SUB-1");
  assert.equal(row.association, "ASSOCIATED");
  assert.deepEqual(row.pendingReconciliation, [
    {eventId: "event-1", reasons: ["INVALID_PLAN_ID"]},
  ]);
  assert.deepEqual(row.conflicts, ["PENDING_RECONCILIATION"]);
  assert.equal("email" in row, false);
  assert.equal("logoUrl" in row, false);
});

test("CLI mantiene paginación acotada", () => {
  assert.deepEqual(parseArgs([
    "--project", "demo", "--tenant", "uno", "--page-size", "50",
  ]), {project: "demo", tenant: "uno", pageSize: 50});
  assert.throws(() => parseArgs(["--page-size", "0"]));
});

#!/usr/bin/env node
"use strict";

// Production backup readiness check (D3-14).
// Uses the Atlas CLI already used for D2/D3. Prints states/counts only.

const { execFileSync } = require("node:child_process");

const ATLAS = process.env.ATLAS_BIN || "atlas";
const PROJECT_ID = process.env.ATLAS_PROD_PROJECT_ID || "6af7de8d05cbff3cac56c9e5";
const CLUSTER = process.env.ATLAS_PROD_CLUSTER || "setu-production";

const parseJson = (text) => {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) {
        throw new Error("Atlas CLI did not return JSON");
    }
    return JSON.parse(text.slice(start, end + 1));
};

const atlasJson = (args) =>
    execFileSync(ATLAS, [...args, "--projectId", PROJECT_ID, "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });

const main = () => {
    let cluster;
    try {
        cluster = parseJson(atlasJson(["clusters", "describe", CLUSTER]));
    } catch (error) {
        console.error(`FAIL could not read cluster ${CLUSTER}: ${error.message}`);
        process.exit(1);
    }

    console.log(`cluster=${CLUSTER} tier=${cluster.clusterType ?? "unknown"} backupEnabled=${cluster.backupEnabled}`);
    if (cluster.backupEnabled !== true) {
        console.error("FAIL Cloud Backup is disabled. M0 does not support Cloud Backup/PITR.");
        console.error("      M10+ is paid and NOT approved; use the manual mongodump fallback unless the company approves budget.");
        process.exit(1);
    }

    let snapshots;
    try {
        snapshots = parseJson(atlasJson(["backups", "snapshots", "list", CLUSTER]));
    } catch (error) {
        console.error(`FAIL could not list snapshots: ${error.message}`);
        process.exit(1);
    }

    const results = Array.isArray(snapshots) ? snapshots : snapshots.results || [];
    console.log(`snapshots=${results.length}`);
    if (results.length === 0) {
        console.error("FAIL no Cloud Backup snapshot exists yet");
        process.exit(1);
    }

    const newest = results[results.length - 1];
    console.log(`newest_snapshot=${newest.id ?? "unknown"} created=${newest.createdAt ?? "unknown"}`);
    console.log("PASS production Cloud Backup is enabled and a snapshot exists");
};

main();

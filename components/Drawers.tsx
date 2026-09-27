"use client";

/**
 * The two reading dialogs, both DIRECT children of .atlas-shell (Atlas mounts them): "Source registry" and
 * "Method & audit". The implementations live in components/docs/ (DocSheet = the shared large reading sheet).
 */

export { SourceRegistry as SourcesDrawer } from "./docs/SourceRegistry";
export { MethodAudit as MethodDrawer } from "./docs/MethodAudit";

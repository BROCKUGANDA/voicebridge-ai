-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "ip" TEXT NOT NULL DEFAULT '0.0.0.0',
    "ua" TEXT NOT NULL DEFAULT '',
    "ok" BOOLEAN NOT NULL DEFAULT true
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AccessibilityMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "taskCompletionRate" REAL,
    "avgCommandsPerTask" REAL,
    "errorRate" REAL,
    "userSatisfaction" REAL,
    "independenceScore" REAL,
    "cognitiveLoadScore" REAL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessibilityMetric_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VoiceSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AccessibilityMetric" ("avgCommandsPerTask", "cognitiveLoadScore", "errorRate", "id", "independenceScore", "recordedAt", "sessionId", "taskCompletionRate", "userSatisfaction") SELECT "avgCommandsPerTask", "cognitiveLoadScore", "errorRate", "id", "independenceScore", "recordedAt", "sessionId", "taskCompletionRate", "userSatisfaction" FROM "AccessibilityMetric";
DROP TABLE "AccessibilityMetric";
ALTER TABLE "new_AccessibilityMetric" RENAME TO "AccessibilityMetric";
CREATE INDEX "AccessibilityMetric_sessionId_idx" ON "AccessibilityMetric"("sessionId");
CREATE INDEX "AccessibilityMetric_recordedAt_idx" ON "AccessibilityMetric"("recordedAt");
CREATE TABLE "new_InteractionHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "responseTimeMs" INTEGER,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InteractionHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InteractionHistory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VoiceSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InteractionHistory" ("command", "createdAt", "id", "metadata", "response", "responseTimeMs", "sessionId", "success", "type", "userId") SELECT "command", "createdAt", "id", "metadata", "response", "responseTimeMs", "sessionId", "success", "type", "userId" FROM "InteractionHistory";
DROP TABLE "InteractionHistory";
ALTER TABLE "new_InteractionHistory" RENAME TO "InteractionHistory";
CREATE INDEX "InteractionHistory_userId_idx" ON "InteractionHistory"("userId");
CREATE INDEX "InteractionHistory_sessionId_idx" ON "InteractionHistory"("sessionId");
CREATE INDEX "InteractionHistory_type_idx" ON "InteractionHistory"("type");
CREATE INDEX "InteractionHistory_createdAt_idx" ON "InteractionHistory"("createdAt");
CREATE TABLE "new_VisualAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "sessionId" TEXT,
    "elementType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "boundingBox" TEXT NOT NULL DEFAULT '{}',
    "accessibilityAttributes" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisualAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VisualAnalysis_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VoiceSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VisualAnalysis" ("accessibilityAttributes", "boundingBox", "confidence", "createdAt", "description", "elementType", "id", "sessionId", "userId") SELECT "accessibilityAttributes", "boundingBox", "confidence", "createdAt", "description", "elementType", "id", "sessionId", "userId" FROM "VisualAnalysis";
DROP TABLE "VisualAnalysis";
ALTER TABLE "new_VisualAnalysis" RENAME TO "VisualAnalysis";
CREATE INDEX "VisualAnalysis_userId_idx" ON "VisualAnalysis"("userId");
CREATE INDEX "VisualAnalysis_sessionId_idx" ON "VisualAnalysis"("sessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AuditEvent_ts_idx" ON "AuditEvent"("ts");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_idx" ON "AuditEvent"("userId");


import Dexie, { Table } from "dexie";
import {
  StoredKey,
  KeyQuota,
  UsageDataPoint,
  ErrorLogEntry,
  VerifiedModelMetadata,
} from "../models/types";

export class LLMKeyManagerDB extends Dexie {
  keys!: Table<StoredKey>;
  quotas!: Table<KeyQuota>;
  usageLogs!: Table<UsageDataPoint>;
  errorLogs!: Table<ErrorLogEntry>;
  modelCache!: Table<VerifiedModelMetadata>;

  constructor() {
    super("LLMKeyManagerDB");
    this.version(8).stores({
      keys: "id, providerId, fingerprint, lastUsed",
      quotas: "keyId",
      usageLogs: "++id, timestamp, keyId, providerId, [providerId+timestamp]", // Optimized for analytics
      errorLogs: "++id, timestamp, keyId, providerId",
      modelCache:
        "[modelId+keyId], keyId, providerId, lastCheckedAt, isAvailable, nextRetryAt, retryCount, state, averageLatency", // Added state + latency
    });
  }
}

export const db = new LLMKeyManagerDB();

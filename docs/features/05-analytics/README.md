# Feature 5: Analytics & Usage Tracking

> **Phase:** 5 (Observability) · **Status:** ✅ Complete

## Purpose

Track API usage, costs, and errors in real-time — all client-side. Provides per-provider statistics, hourly breakdowns for charting, and cost estimation using model-specific pricing data.

## Usage Recording

Every successful API call records:

```typescript
{
  keyId: string,
  providerId: AIProviderId,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cost: number,        // Calculated from MODEL_PRICING
  success: boolean,
  latencyMs: number,
  timestamp: number
}
```

Cost is auto-calculated using `MODEL_PRICING` (per 1M tokens). Falls back to provider-level defaults if specific model pricing isn't available.

## Error Recording

Errors are logged with **automatic secret redaction**:

```typescript
{
  keyId: string,
  providerId: AIProviderId,
  errorType: "rate_limit" | "auth" | "server" | "network" | "quota" | "unknown",
  message: string,     // Redacted: sk-***, AIzaSy***, Bearer ***
  retryCount: number,
  timestamp: number
}
```

### Redaction Patterns
- `sk-[20+ chars]` → `[REDACTED]`
- `AIzaSy[33 chars]` → `[REDACTED]`
- `Bearer [token]` → `[REDACTED]`
- `api_key=[value]` → `[REDACTED]`

## Available Queries

```typescript
// Per-provider aggregated stats
analyticsService.getProviderStats("openai", since?);
// → { totalRequests, successfulRequests, failedRequests, totalTokens, totalCost, avgLatency }

// Hourly breakdown for charts
analyticsService.getHourlyBreakdown(24);
// → [{ hour: "09:00", requests, tokens, cost, errors }, ...]

// Raw data access
analyticsService.getUsageData(startTime?, endTime?);
analyticsService.getErrorLogs(startTime?, endTime?);
```

## Storage Limits

| Store | Max In-Memory | Persisted |
|:------|:-------------|:----------|
| Usage logs | 1,000 entries | IndexedDB `usageLogs` |
| Error logs | 500 entries | IndexedDB `errorLogs` |

Oldest entries are trimmed automatically when limits are exceeded.

## Key Files

| File | Purpose |
|:-----|:--------|
| `src/services/analytics.service.ts` | Usage/error recording, aggregation, secret redaction |
| `src/services/model-capabilities.ts` | `calculateCost()` helper |
| `src/constants/pricing.json` | Per-model pricing data (per 1M tokens) |

## Test Coverage

The `AnalyticsService` test suite (`tests/analytics/analytics.service.test.ts`) covers the following critical behaviors:

- **Secret Redaction:** Verifies that API keys for OpenAI/Anthropic (`sk-...`), Gemini (`AIzaSy...`), `Bearer` headers, and raw JSON `api_key` patterns are safely masked as `[REDACTED]` before saving to storage.
- **Provider Statistics:** Ensures that `avgLatency` is calculated strictly from successful requests and that `totalTokens` and `failedRequests` are aggregated accurately. Validates the `sinceTime` filter.
- **Timezone-Agnostic Hourly Buckets:** Confirms that `getHourlyBreakdown` dynamically initializes and accurately bins events into local `HH:00` buckets without failure across varying local timezones.
- **Storage Trimming:** Mocks IndexedDB transactions to rapidly assert that exactly the newest 1,000 usage logs and 500 error logs are retained in memory.
- **Pub/Sub Notifications:** Confirms that active subscribers correctly receive callback notifications when usage is recorded, errors are logged, or the dataset is cleared.

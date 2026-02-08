/**
 * Circuit Breaker Module
 *
 * Implements the circuit breaker pattern for keys and providers.
 * Protects the system from cascading failures by temporarily
 * blocking requests to failing resources.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Tripped, all requests blocked
 * - HALF_OPEN: Testing recovery, limited requests allowed
 */

import type { AIProviderId } from "../../models/types";
import type {
  CircuitBreakerConfig,
  CircuitBreakerState,
  CircuitState,
  SafetyEvent,
} from "./safety-events";

// ============================================
// DEFAULT CONFIGURATIONS
// ============================================

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 5 * 60 * 1000, // 5 minutes
  successThreshold: 2,
  failureWindowMs: 60 * 1000, // 1 minute
};

export const PROVIDER_CIRCUIT_CONFIGS: Partial<
  Record<AIProviderId, Partial<CircuitBreakerConfig>>
> = {
  openai: {
    failureThreshold: 3,
    cooldownMs: 10 * 60 * 1000, // 10 minutes - strict rate limits
  },
  anthropic: {
    failureThreshold: 5,
    cooldownMs: 5 * 60 * 1000,
  },
  gemini: {
    failureThreshold: 4,
    cooldownMs: 3 * 60 * 1000, // Google recovers faster
  },
};

// ============================================
// CIRCUIT BREAKER CLASS
// ============================================

export class CircuitBreaker {
  private keyCircuits: Map<string, CircuitBreakerState> = new Map();
  private providerCircuits: Map<AIProviderId, CircuitBreakerState> = new Map();

  /**
   * Create a fresh circuit state
   */
  private createState(): CircuitBreakerState {
    return {
      state: "CLOSED",
      failures: 0,
      successes: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
      openedAt: null,
      failureHistory: [],
    };
  }

  /**
   * Get circuit state for a key
   */
  getKeyCircuit(keyId: string): CircuitBreakerState {
    if (!this.keyCircuits.has(keyId)) {
      this.keyCircuits.set(keyId, this.createState());
    }
    return this.keyCircuits.get(keyId)!;
  }

  /**
   * Get circuit state for a provider
   */
  getProviderCircuit(providerId: AIProviderId): CircuitBreakerState {
    if (!this.providerCircuits.has(providerId)) {
      this.providerCircuits.set(providerId, this.createState());
    }
    return this.providerCircuits.get(providerId)!;
  }

  /**
   * Get config for a provider (with defaults)
   */
  getConfig(providerId?: AIProviderId): CircuitBreakerConfig {
    if (providerId && PROVIDER_CIRCUIT_CONFIGS[providerId]) {
      return {
        ...DEFAULT_CIRCUIT_CONFIG,
        ...PROVIDER_CIRCUIT_CONFIGS[providerId],
      };
    }
    return DEFAULT_CIRCUIT_CONFIG;
  }

  /**
   * Check if key circuit is open (blocking requests)
   */
  isKeyCircuitOpen(keyId: string): boolean {
    return this.getKeyCircuit(keyId).state === "OPEN";
  }

  /**
   * Check if provider circuit is open
   */
  isProviderCircuitOpen(providerId: AIProviderId): boolean {
    return this.getProviderCircuit(providerId).state === "OPEN";
  }

  /**
   * Get current state of a key's circuit
   */
  getKeyCircuitState(keyId: string): CircuitState {
    return this.getKeyCircuit(keyId).state;
  }

  /**
   * Record a failure for a key
   */
  recordKeyFailure(
    keyId: string,
    providerId?: AIProviderId,
    emitFn?: (event: SafetyEvent) => void,
  ): CircuitState {
    const circuit = this.getKeyCircuit(keyId);
    const config = this.getConfig(providerId);
    return this.recordFailure(circuit, config, `key:${keyId}`, emitFn);
  }

  /**
   * Record a success for a key
   */
  recordKeySuccess(
    keyId: string,
    emitFn?: (event: SafetyEvent) => void,
  ): CircuitState {
    const circuit = this.getKeyCircuit(keyId);
    return this.recordSuccess(circuit, `key:${keyId}`, emitFn);
  }

  /**
   * Record a failure for a provider
   */
  recordProviderFailure(
    providerId: AIProviderId,
    emitFn?: (event: SafetyEvent) => void,
  ): CircuitState {
    const circuit = this.getProviderCircuit(providerId);
    const config = this.getConfig(providerId);
    return this.recordFailure(
      circuit,
      config,
      `provider:${providerId}`,
      emitFn,
    );
  }

  /**
   * Record a success for a provider
   */
  recordProviderSuccess(
    providerId: AIProviderId,
    emitFn?: (event: SafetyEvent) => void,
  ): CircuitState {
    const circuit = this.getProviderCircuit(providerId);
    return this.recordSuccess(circuit, `provider:${providerId}`, emitFn);
  }

  /**
   * Reset a key's circuit to initial state
   */
  resetKeyCircuit(keyId: string, emitFn?: (event: SafetyEvent) => void): void {
    this.keyCircuits.set(keyId, this.createState());
    console.log(`[CircuitBreaker] 🔄 Circuit key:${keyId} RESET`);
    emitFn?.({ type: "CIRCUIT_RESET", label: `key:${keyId}` });
  }

  /**
   * Reset a provider's circuit to initial state
   */
  resetProviderCircuit(
    providerId: AIProviderId,
    emitFn?: (event: SafetyEvent) => void,
  ): void {
    this.providerCircuits.set(providerId, this.createState());
    console.log(`[CircuitBreaker] 🔄 Circuit provider:${providerId} RESET`);
    emitFn?.({ type: "CIRCUIT_RESET", label: `provider:${providerId}` });
  }

  /**
   * Get all circuit states for serialization
   */
  getKeyCircuitsSnapshot(): Array<[string, CircuitBreakerState]> {
    return Array.from(this.keyCircuits.entries());
  }

  /**
   * Get all provider circuit states for serialization
   */
  getProviderCircuitsSnapshot(): Array<[AIProviderId, CircuitBreakerState]> {
    return Array.from(this.providerCircuits.entries());
  }

  /**
   * Restore circuits from snapshot
   */
  restoreKeyCircuits(data: Array<[string, CircuitBreakerState]>): void {
    this.keyCircuits = new Map(data);
  }

  /**
   * Restore provider circuits from snapshot
   */
  restoreProviderCircuits(
    data: Array<[AIProviderId, CircuitBreakerState]>,
  ): void {
    this.providerCircuits = new Map(data);
  }

  /**
   * Clear all circuits
   */
  clear(): void {
    this.keyCircuits.clear();
    this.providerCircuits.clear();
  }

  // ============================================
  // CORE LOGIC
  // ============================================

  private recordFailure(
    circuit: CircuitBreakerState,
    config: CircuitBreakerConfig,
    label: string,
    emitFn?: (event: SafetyEvent) => void,
  ): CircuitState {
    const now = Date.now();

    // If OPEN, check cooldown for transition to HALF_OPEN
    if (circuit.state === "OPEN") {
      if (circuit.openedAt && now - circuit.openedAt > config.cooldownMs) {
        circuit.state = "HALF_OPEN";
        circuit.successes = 0;
        console.log(
          `[CircuitBreaker] 🔄 ${label} -> HALF_OPEN (testing recovery)`,
        );
        emitFn?.({ type: "CIRCUIT_HALF_OPEN", label });
      }
      circuit.failures++;
      circuit.lastFailureAt = now;
      return circuit.state;
    }

    // Clean up old failures outside the window
    circuit.failureHistory = circuit.failureHistory.filter(
      (ts) => now - ts < config.failureWindowMs,
    );

    // Add this failure
    circuit.failureHistory.push(now);
    circuit.failures++;
    circuit.lastFailureAt = now;

    // If HALF_OPEN and got a failure, trip back to OPEN
    if (circuit.state === "HALF_OPEN") {
      circuit.state = "OPEN";
      circuit.openedAt = now;
      console.warn(`[CircuitBreaker] ⛔ ${label} -> OPEN (recovery failed)`);
      emitFn?.({ type: "CIRCUIT_OPENED", label, reason: "Recovery failed" });
      return circuit.state;
    }

    // Check if we should trip the breaker
    if (circuit.failureHistory.length >= config.failureThreshold) {
      circuit.state = "OPEN";
      circuit.openedAt = now;
      console.warn(
        `[CircuitBreaker] ⛔ ${label} -> OPEN (${config.failureThreshold} failures)`,
      );
      emitFn?.({
        type: "CIRCUIT_OPENED",
        label,
        reason: `${config.failureThreshold} failures`,
      });
    }

    return circuit.state;
  }

  private recordSuccess(
    circuit: CircuitBreakerState,
    label: string,
    emitFn?: (event: SafetyEvent) => void,
  ): CircuitState {
    const now = Date.now();

    circuit.successes++;
    circuit.lastSuccessAt = now;

    // If HALF_OPEN and got enough successes, close the circuit
    if (circuit.state === "HALF_OPEN") {
      const config = DEFAULT_CIRCUIT_CONFIG;
      if (circuit.successes >= config.successThreshold) {
        circuit.state = "CLOSED";
        circuit.failures = 0;
        circuit.failureHistory = [];
        circuit.openedAt = null;
        console.log(`[CircuitBreaker] ✅ ${label} -> CLOSED (recovered)`);
        emitFn?.({ type: "CIRCUIT_CLOSED", label });
      }
    } else if (circuit.state === "CLOSED") {
      // Reset failure count on success in normal mode
      circuit.failures = 0;
      circuit.failureHistory = [];
    }

    return circuit.state;
  }
}

// Singleton instance
export const circuitBreaker = new CircuitBreaker();

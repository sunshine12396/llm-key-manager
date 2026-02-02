import { AIProviderId } from "../metadata";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string; // Optional name for the participant
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string | string[];
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  jsonMode?: boolean; // Force JSON output (legacy)
  response_format?: { type: "text" | "json_object" }; // Modern structured output
  timeout?: number; // Request timeout in milliseconds
  tools?: ToolDefinition[];
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | { type: "function"; function: { name: string } };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, any>; // JSON Schema object
  };
}

export type FinishReason =
  | "stop"
  | "length"
  | "content_filter"
  | "tool_calls"
  | "error"
  | null;

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costEstimate?: number; // Estimated cost in USD
}

export interface ChatResponse {
  content: string;
  usage?: TokenUsage;
  model: string; // The authenticated model name
  providerId?: AIProviderId;
  finishReason?: FinishReason;
  created?: number; // Timestamp
  attempts?: number; // Number of failed attempts before success
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

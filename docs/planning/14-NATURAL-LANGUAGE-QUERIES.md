# 14 — Natural Language Queries (NLQ)

## Overview

Natural Language Queries allow users to type plain English (or any language)
questions and get charts, tables, and KPI cards back — automatically. No SQL
knowledge, no query builder interaction, no manual metric/dimension selection.

```
User types: "monthly revenue by region for 2025"
     ↓
Platform returns: a bar chart with revenue on Y-axis, months on X-axis,
                  grouped by region, filtered to 2025
```

This is the **headline feature** that differentiates Pulseboard from every
competitor except the most expensive enterprise tools.

## Why It's Feasible

Most text-to-SQL systems are fragile because they generate raw SQL against
arbitrary schemas — an enormous search space with infinite ways to fail.

Pulseboard has a critical advantage: the **semantic layer**. The LLM doesn't
need to understand database schemas, JOIN conditions, or SQL syntax. It only
needs to:

1. Pick from a **finite list** of pre-defined metrics and dimensions
2. Extract filter conditions from natural language
3. Suggest a chart type
4. Output a structured JSON (not SQL)

This reduces the problem from "generate SQL" to "classify and extract" — a
task that even small, cheap models handle reliably.

```
Traditional text-to-SQL:              Pulseboard NLQ:
───────────────────────              ──────────────────
Input: natural language              Input: natural language
                                     Context: semantic model (finite vocabulary)
Output: raw SQL                      Output: QueryDefinition JSON
Risk: SQL injection, broken          Risk: wrong metric picked (validated)
      queries, wrong JOINs,                 → retry or ask for clarification
      performance bombs
Accuracy: ~70-80%                    Accuracy: ~95%+ (constrained output)
```

---

## Architecture

### System Flow

```
┌───────────────────────────────────────────────────────────┐
│                        User Input                          │
│         "show me monthly revenue by region for 2025"       │
└────────────────────────────┬──────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────┐
│                      NLQ Service                           │
│                     (NestJS module)                         │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 1. CONTEXT ASSEMBLY                                  │  │
│  │                                                      │  │
│  │    Load tenant's semantic model(s):                  │  │
│  │    - Metric catalog (slug, name, description)        │  │
│  │    - Dimension catalog (slug, name, type, gran.)     │  │
│  │    - Named filter catalog (slug, name, description)  │  │
│  │    - Model descriptions (what domain each covers)    │  │
│  │                                                      │  │
│  │    If multiple models: include all with descriptions  │  │
│  │    so the LLM can pick the right one.                │  │
│  └─────────────────────────────────────────────────────┘  │
│                             │                              │
│  ┌─────────────────────────▼───────────────────────────┐  │
│  │ 2. PROMPT CONSTRUCTION                               │  │
│  │                                                      │  │
│  │    System prompt: role, output format, constraints    │  │
│  │    Context: serialized model catalog (~2-4KB)        │  │
│  │    Conversation history (if follow-up query)         │  │
│  │    User message: the natural language query          │  │
│  └─────────────────────────────────────────────────────┘  │
│                             │                              │
│  ┌─────────────────────────▼───────────────────────────┐  │
│  │ 3. LLM CALL                                          │  │
│  │                                                      │  │
│  │    Provider: configurable (Claude, OpenAI, Ollama)   │  │
│  │    Model: small/fast (Haiku, GPT-4o-mini, Llama 3)  │  │
│  │    Response format: JSON (structured output)         │  │
│  │    Temperature: 0 (deterministic)                    │  │
│  │    Timeout: 10s                                      │  │
│  └─────────────────────────────────────────────────────┘  │
│                             │                              │
│  ┌─────────────────────────▼───────────────────────────┐  │
│  │ 4. RESPONSE PARSING & VALIDATION                     │  │
│  │                                                      │  │
│  │    Parse JSON response with Zod schema               │  │
│  │    Validate all metric slugs exist in model          │  │
│  │    Validate all dimension slugs exist in model       │  │
│  │    Validate filter operators and value types          │  │
│  │    Validate chart type is supported                  │  │
│  │                                                      │  │
│  │    If validation fails:                              │  │
│  │      → Retry once with error context                 │  │
│  │      → If still fails: return error + open query     │  │
│  │        builder pre-filled with partial result        │  │
│  └─────────────────────────────────────────────────────┘  │
│                             │                              │
│  ┌─────────────────────────▼───────────────────────────┐  │
│  │ 5. QUERY DEFINITION OUTPUT                           │  │
│  │                                                      │  │
│  │    Convert validated response → QueryDefinition      │  │
│  │    Resolve slugs to actual metric/dimension IDs      │  │
│  │    Set default sort, limit if not specified           │  │
│  │    Include suggested chart type and title            │  │
│  └─────────────────────────────────────────────────────┘  │
└────────────────────────────┬──────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────┐
│                  Existing Query Engine                      │
│          QueryDefinition → SQL → Execute → Results         │
└────────────────────────────┬──────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────┐
│                   Dashboard / Widget                       │
│            Renders chart with suggested type + title        │
└───────────────────────────────────────────────────────────┘
```

### Where NLQ Sits in the Stack

```
┌─────────────────┐
│  Dashboard UI    │
│  ┌─────────────┐│
│  │ NLQ Input   ││  ← Text box at the top of every page
│  │ "Ask a      ││
│  │  question"  ││
│  └──────┬──────┘│
└─────────┼───────┘
          │
┌─────────▼───────┐
│  NLQ Service     │  ← NEW: translates NL → QueryDefinition
│  (NestJS module) │
└─────────┬───────┘
          │
┌─────────▼───────┐
│  Query Engine    │  ← EXISTING: translates QD → SQL → results
└─────────┬───────┘
          │
┌─────────▼───────┐
│  Widget Renderer │  ← EXISTING: renders results as chart
└─────────────────┘
```

NLQ is an **alternative input method** to the visual query builder. Both
produce the same `QueryDefinition` output. Everything downstream is shared.

---

## Prompt Engineering

### System Prompt

```
You are a data analytics assistant for the Pulseboard platform.
Your job is to translate natural language questions into structured
query definitions.

You will be given:
1. A list of available semantic models with their metrics and dimensions
2. A user's natural language question
3. Optionally, a previous query (for follow-up refinement)

You must respond with a JSON object matching the QueryResponse schema.

RULES:
- Only use metrics and dimensions that exist in the provided models
- If a query is ambiguous, pick the most likely interpretation
- If you cannot map the query to any available metrics, set
  "confidence" to "low" and "clarificationNeeded" to a question
- For time-based queries without explicit dates, use reasonable
  defaults (e.g., "this year" = current year)
- Always suggest the most appropriate chart type
- Set sort to the primary metric descending by default
- Temperature is 0 — be deterministic and precise
```

### Context Template

```
AVAILABLE MODELS:

Model: "Sales Analytics" (id: 01KP...)
  Description: Revenue, orders, and customer metrics for e-commerce

  Metrics:
    - revenue: Total Revenue — SUM of order totals (format: €currency)
    - order_count: Order Count — COUNT of orders (format: number)
    - avg_order_value: Average Order Value — AVG of order totals (format: €currency)
    - unique_customers: Unique Customers — COUNT_DISTINCT of customer IDs (format: number)

  Dimensions:
    - region: Region — customer's region (categorical)
    - product_category: Product Category — product's category (categorical)
    - order_date: Order Date — order creation date (temporal: day/week/month/quarter/year)
    - customer_segment: Customer Segment — customer tier (categorical)

  Named Filters:
    - active_customers: Active Customers — only customers with status 'active'
    - high_value: High Value Orders — orders over €500

---

Model: "Team Performance" (id: 01KP...)
  Description: Employee productivity and task metrics
  ...
```

### Response Schema

```typescript
const NLQueryResponseSchema = z.object({
  // Which model to query
  modelSlug: z.string(),

  // What to measure
  metrics: z.array(z.string()).min(1),

  // How to slice it
  dimensions: z.array(z.object({
    slug: z.string(),
    granularity: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional(),
  })).default([]),

  // Filters extracted from the query
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'between', 'like']),
    value: z.unknown(),
  })).default([]),

  // Named filters to apply
  namedFilters: z.array(z.string()).default([]),

  // Sort
  sort: z.array(z.object({
    field: z.string(),
    direction: z.enum(['asc', 'desc']),
  })).default([]),

  // Limit
  limit: z.number().optional(),

  // Visualization
  chartType: z.enum([
    'kpi_card', 'line_chart', 'bar_chart', 'area_chart',
    'pie_chart', 'donut_chart', 'funnel_chart', 'table',
  ]),

  // Suggested title for the widget
  title: z.string(),

  // Confidence in the interpretation
  confidence: z.enum(['high', 'medium', 'low']),

  // If confidence is low, what to ask the user
  clarificationNeeded: z.string().nullable().default(null),
});
```

---

## Conversation & Follow-Up Queries

NLQ supports multi-turn conversations where each message refines the previous
result.

### How It Works

```
Turn 1: "show me revenue by region"
  → LLM receives: model catalog + user query
  → Returns: {metrics: [revenue], dimensions: [region], chartType: bar_chart}
  → Chart rendered

Turn 2: "break it down by month"
  → LLM receives: model catalog + previous QueryDefinition + new instruction
  → Returns: {metrics: [revenue], dimensions: [region, {order_date, month}], chartType: bar_chart}
  → Chart updated (grouped bars by month)

Turn 3: "only Germany and France"
  → LLM receives: model catalog + previous QD + "only Germany and France"
  → Returns: previous QD + filters: [{region, in, [DE, FR]}]
  → Chart filtered

Turn 4: "make it a line chart and add order count"
  → Returns: metrics: [revenue, order_count], chartType: line_chart, same dims/filters
  → Chart type changes, second line appears

Turn 5: "save this as a dashboard widget"
  → Not an LLM call — the current QueryDefinition is saved as a widget
```

### Conversation Context Management

```typescript
interface NLQConversation {
  id: string;
  tenantId: string;
  userId: string;
  turns: NLQTurn[];
  currentQuery: QueryDefinition | null;
  startedAt: Date;
  lastActivityAt: Date;
}

interface NLQTurn {
  role: 'user' | 'assistant';
  message: string;                    // user's text or LLM's explanation
  queryDefinition?: QueryDefinition;  // the resulting query (if any)
  timestamp: Date;
}
```

Conversations are stored in Redis with a TTL (30 minutes of inactivity).
They're ephemeral — not persisted to the database unless the user explicitly
saves the result as a widget or query.

### Follow-Up Prompt Template

```
PREVIOUS QUERY (the current state of the chart):
${JSON.stringify(previousQueryDefinition)}

USER'S FOLLOW-UP INSTRUCTION:
"${userMessage}"

Update the previous query based on the user's instruction.
Only change what the user explicitly asks to change.
Keep everything else the same.
```

---

## LLM Provider Architecture

### Design Principle: Interface + Factory

Inspired by the migrobrain LLM interaction service pattern (used in MigroNet's
OCR/document extraction pipeline), the NLQ system uses an **interface + factory**
architecture. Every LLM provider implements the same interface. A factory resolves
the correct provider at runtime based on platform config, tenant config, or
per-request override.

This means:
- Adding a new provider = one new class implementing the interface
- Tenants can bring their own provider/model/endpoint without platform code changes
- Failover between providers is transparent

### Provider Interface

```typescript
interface LLMProviderConfig {
  provider: string;       // "anthropic", "openai", "groq", "openrouter", "ollama", "custom"
  model: string;          // "claude-haiku-4-5", "llama-3-8b", etc.
  apiKey?: string;        // encrypted, from tenant config or platform config
  baseUrl?: string;       // for self-hosted / custom endpoints
  timeout?: number;       // ms, default 10000
  temperature?: number;   // default 0
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
  provider: string;
}

interface LLMProvider {
  readonly name: string;
  readonly supportedModels: string[];
  chat(messages: ChatMessage[], config: LLMProviderConfig): Promise<LLMResponse>;
  estimateCost(inputTokens: number, outputTokens: number, model: string): number;
  healthCheck(config: LLMProviderConfig): Promise<boolean>;
}
```

### Provider Factory

```typescript
class LLMProviderFactory {
  private providers = new Map<string, LLMProvider>();

  constructor() {
    this.register('anthropic', new AnthropicProvider());
    this.register('openai', new OpenAIProvider());
    this.register('groq', new GroqProvider());
    this.register('openrouter', new OpenRouterProvider());
    this.register('ollama', new OllamaProvider());
    this.register('custom', new CustomEndpointProvider());
  }

  resolve(config: LLMProviderConfig): LLMProvider {
    const provider = this.providers.get(config.provider);
    if (!provider) throw new Error(`Unsupported LLM provider: ${config.provider}`);
    return provider;
  }
}
```

### Built-In Providers

#### 1. Anthropic (Claude)

Best accuracy for structured JSON extraction. Platform default.

- Models: `claude-haiku-4-5` (fast, cheap), `claude-sonnet-4-6` (smarter),
  `claude-opus-4-6` (overkill but available)
- Uses `@anthropic-ai/sdk`, supports JSON mode via tool_use
- Best for: default provider, retry-on-ambiguity with Sonnet

#### 2. OpenAI

Widely available fallback.

- Models: `gpt-4o-mini` (cheap, fast), `gpt-4o` (smarter)
- Uses `openai` SDK, supports `response_format: { type: "json_object" }`

#### 3. Groq Cloud

**Fastest inference available.** Groq's LPU hardware runs open models at
~500 tokens/sec (10x faster than GPU inference). NLQ prompts are small
(~2K tokens in, ~300 out) — Groq processes this in 100-300ms, making NLQ
feel instant.

- Models: `llama-3.3-70b-versatile` (best accuracy), `llama-3.1-8b-instant`
  (fastest, ~100ms), `mixtral-8x7b-32768`, `gemma2-9b-it`
- OpenAI-compatible API (`https://api.groq.com/openai/v1`)
- Supports JSON mode
- Best for: primary provider when latency matters most

#### 4. OpenRouter

**Universal gateway to 100+ models.** Single integration that unlocks every
major model provider (Mistral, Cohere, Google Gemini, Meta Llama, Anthropic,
OpenAI, etc.) through one API key.

- Models: any model available on OpenRouter (passed through)
- OpenAI-compatible API (`https://openrouter.ai/api/v1`)
- Pricing varies per model (OpenRouter provides pricing API)
- Best for: BYOK tenants who want maximum model flexibility without us
  integrating each provider individually

#### 5. Ollama (Self-Hosted)

On-premise deployment where data cannot leave the tenant's network.

- Models: any model installed on the Ollama instance (llama3, mistral, phi3, etc.)
- OpenAI-compatible API (`http://{tenant-host}:11434/v1`)
- No API key needed (local network)
- Best for: enterprise, air-gapped environments, privacy-sensitive industries

#### 6. Custom Endpoint (Tenant's Own AI Pipeline)

Tenants who have their **own AI infrastructure** — a custom FastAPI service,
a fine-tuned model, or a pipeline like the migrobrain LLM interaction service.
The platform doesn't need to know what's behind the endpoint.

**Contract:** We standardize on the **OpenAI chat/completions API format** as
the common protocol. Any tenant service that speaks this protocol works out of
the box. This is the same format OpenRouter, Groq, Ollama, and most providers
already use — it's the de facto industry standard.

```
POST {tenant_base_url}/chat/completions
Content-Type: application/json
Authorization: Bearer {tenant_api_key}   (optional)

{
  "model": "tenant-custom-model",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "temperature": 0,
  "response_format": {"type": "json_object"}
}

→ 200 OK
{
  "choices": [{"message": {"role": "assistant", "content": "{...json...}"}}],
  "usage": {"prompt_tokens": 1200, "completion_tokens": 300}
}
```

If the tenant's service uses a different format (e.g., the migrobrain pattern
with `system`/`user` prompt dict), they deploy a thin OpenAI-compatible adapter
in front of it. We provide documentation and an example adapter.

**Use cases:**
- Tenant runs migrobrain-style service with Groq/Ollama behind it
- Tenant has a fine-tuned model on their own GPU cluster
- Tenant uses vLLM, TGI, or another serving framework
- Tenant wraps a RAG pipeline that enriches prompts with internal docs

### Provider Resolution Chain

```
1. Per-request override (header: X-LLM-Provider)  ← for A/B testing / debugging
2. Tenant config (tenant.settings.nlq.provider)    ← tenant admin selects provider
3. Platform default (env: NLQ_DEFAULT_PROVIDER)    ← Pulseboard's own API key
4. Fallback chain (env: NLQ_FALLBACK_PROVIDERS)    ← e.g., "groq → anthropic → openai"
```

### Failover Strategy

```
Primary provider call
  ├─ Success → return result
  ├─ Timeout (>10s) or 5xx → try next in fallback chain
  │   ├─ Fallback success → return (log: primary failed)
  │   └─ All fallbacks fail → "NLQ unavailable, try the query builder"
  └─ 4xx (auth, bad request) → don't retry (config issue, not transient)
```

### Tenant NLQ Configuration UI

```
┌──────────────────────────────────────────────────────────────┐
│  Settings > AI / Natural Language Queries                     │
│                                                              │
│  ┌── Provider ─────────────────────────────────────────────┐ │
│  │  ◉ Platform Default (Groq llama-3.3-70b — included)     │ │
│  │  ○ Anthropic (Claude)         [API Key: •••••••]         │ │
│  │  ○ OpenAI                     [API Key: •••••••]         │ │
│  │  ○ Groq Cloud                 [API Key: •••••••]         │ │
│  │  ○ OpenRouter                 [API Key: •••••••]         │ │
│  │  ○ Self-Hosted (Ollama)       [URL: http://...]          │ │
│  │  ○ Custom Endpoint            [URL: http://...]          │ │
│  │                                [API Key: •••••••]         │ │
│  │                                                          │ │
│  │  Model: [llama-3.3-70b-versatile     ▼]                 │ │
│  │  [Test Connection]  ✓ Connected, 234ms latency           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌── Usage This Month ─────────────────────────────────────┐ │
│  │  127 / 500 queries  ████████░░░░ 25%                    │ │
│  │  Estimated cost: $0.13  •  Cache hit rate: 42%          │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Model Recommendations

| Provider | Model | Latency | Cost/Query | Accuracy | Best For |
|----------|-------|---------|-----------|----------|----------|
| **Groq** | llama-3.3-70b | ~200ms | ~$0.001 | 91%+ | Fastest, great default |
| **Groq** | llama-3.1-8b-instant | ~100ms | ~$0.0003 | 85%+ | Ultra-fast, simple queries |
| **Anthropic** | claude-haiku-4-5 | ~500ms | ~$0.002 | 93%+ | Best accuracy/price |
| **Anthropic** | claude-sonnet-4-6 | ~1.5s | ~$0.01 | 97%+ | Complex/ambiguous queries |
| **OpenAI** | gpt-4o-mini | ~600ms | ~$0.003 | 92%+ | Reliable fallback |
| **OpenRouter** | any model | varies | varies | varies | Max model flexibility |
| **Ollama** | llama3/mistral | ~500-800ms | $0 | 85-90% | Self-hosted, air-gapped |
| **Custom** | tenant's model | varies | $0 | varies | Full tenant control |

**Default recommendation:**
- **Primary:** Groq (llama-3.3-70b) — fastest, cheapest, good accuracy
- **Fallback:** Anthropic (claude-haiku-4-5) — most reliable, best accuracy
- **Retry for ambiguity:** Anthropic (claude-sonnet-4-6) — smartest

### Plan Gating

| Plan | NLQ Queries/Month | Provider Options |
|------|-------------------|-----------------|
| **Free** | 0 (disabled) | — |
| **Starter** | 50 | Platform default only |
| **Pro** | 500 | Platform default + BYOK (any provider) |
| **Business** | Unlimited | BYOK + self-hosted + custom endpoint |
| **Enterprise** | Unlimited | All options + dedicated fine-tuning support |

---

## Caching Strategy

### Query Cache

Same natural language input + same model version = same QueryDefinition.

```
Cache key:   hash(normalized_query + model_id + model_version)
Cache value: NLQueryResponse (the LLM's structured output)
TTL:         24 hours (or until model is updated)
Storage:     Redis
```

### Normalization

Before hashing, normalize the input:
- Lowercase
- Strip extra whitespace
- Expand common abbreviations ("rev" → "revenue", "Q1" → "quarter 1")
- Remove filler words ("show me", "can you", "please")

This increases cache hit rate significantly:
```
"Show me monthly revenue"
"show me the monthly revenue"
"monthly revenue please"
"revenue by month"
→ All normalize to similar forms, potential cache hits
```

### Semantic Cache (Phase B+)

For near-miss queries, use embedding similarity:

```
Query: "revenue by region for 2025"
Cached: "regional revenue in 2025"
Similarity: 0.94 → cache hit (threshold: 0.90)
```

Implementation: embed query strings with a small embedding model, store in
Redis with vector similarity search (or pgvector in PostgreSQL).

---

## Error Handling & Graceful Degradation

### Validation Failure

```
User: "show me the vibes"
LLM returns: {metrics: ["vibes"], ...}
Validation: "vibes" is not a valid metric
  → Retry once: "The metric 'vibes' does not exist. Available metrics are:
    revenue, order_count, avg_order_value, unique_customers.
    Please re-interpret the user's query."
  → If retry fails: return to user with suggestion to use the query builder
```

### Ambiguity

```
User: "show me the numbers"
LLM returns: {confidence: "low", clarificationNeeded:
  "What numbers would you like to see? Available metrics include
   revenue, order count, and average order value."}
  → UI shows the clarification question
  → User responds: "revenue and order count"
  → Continue as a conversation turn
```

### Provider Failure

```
Primary (Claude Haiku) → 500 error or timeout
  → Fallback to secondary (GPT-4o-mini)
  → If both fail: "I couldn't process your question right now.
    Try the visual query builder instead." [link]
```

### Rate Limiting

```
User exceeds plan quota (e.g., 50/month on Starter)
  → "You've used all your natural language queries this month.
    Upgrade to Pro for 500 queries, or use the visual query builder."
  → Query builder is always available, unlimited
```

---

## UI/UX Design

### NLQ Input Bar

Persistent at the top of the dashboard, always visible:

```
┌──────────────────────────────────────────────────────────────┐
│  💬 Ask a question about your data...              [⏎ Ask]  │
└──────────────────────────────────────────────────────────────┘
```

### Query → Result Flow

```
┌──────────────────────────────────────────────────────────────┐
│  💬 "monthly revenue by region for 2025"           [⏎ Ask]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌── Thinking... ──────────────────────────────────────────┐ │
│  │  ░░░░░░░░░░░░░░  Analyzing your question...            │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│          ↓ (500ms later) ↓                                   │
│                                                              │
│  ┌── Result ───────────────────────────────────────────────┐ │
│  │                                                          │ │
│  │  Monthly Revenue by Region (2025)                        │ │
│  │  ┌──────────────────────────────────────────────────┐   │ │
│  │  │         📊 Bar Chart                              │   │ │
│  │  │    ████                                           │   │ │
│  │  │    ████ ████                                      │   │ │
│  │  │    ████ ████ ████                                 │   │ │
│  │  │    Jan  Feb  Mar  Apr  May  ...                   │   │ │
│  │  └──────────────────────────────────────────────────┘   │ │
│  │                                                          │ │
│  │  [Save as Widget]  [Edit in Query Builder]  [Export]     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌── Follow up ────────────────────────────────────────────┐ │
│  │  💬 "break it down by product category"        [⏎ Ask]  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Clarification UI

```
┌──────────────────────────────────────────────────────────────┐
│  💬 "show me the numbers"                          [⏎ Ask]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  🤔 I'm not sure which metrics you'd like to see.           │
│     Your "Sales Analytics" model has these available:        │
│                                                              │
│     ┌────────────────┐  ┌────────────────┐                  │
│     │ 💰 Revenue     │  │ 📦 Order Count │                  │
│     └────────────────┘  └────────────────┘                  │
│     ┌────────────────┐  ┌────────────────┐                  │
│     │ 📊 Avg Order   │  │ 👥 Customers   │                  │
│     └────────────────┘  └────────────────┘                  │
│                                                              │
│  Click one or type a more specific question.                 │
│                                                              │
│  💬 "revenue and order count by month"             [⏎ Ask]  │
└──────────────────────────────────────────────────────────────┘
```

### Suggested Queries

When the NLQ input is focused but empty, show smart suggestions based on
the tenant's semantic model:

```
┌──────────────────────────────────────────────────────────────┐
│  💬 Ask a question about your data...              [⏎ Ask]  │
├──────────────────────────────────────────────────────────────┤
│  Suggested:                                                  │
│  • "revenue trend for the last 12 months"                   │
│  • "top 10 customers by order count"                        │
│  • "revenue by region this quarter vs last quarter"         │
│  • "orders per day this week"                               │
└──────────────────────────────────────────────────────────────┘
```

Suggestions are generated once per model publish (not per query) and cached.

---

## Database Schema Additions

```sql
-- NLQ query history (for analytics, debugging, and caching)
CREATE TABLE nlq_queries (
    id                  VARCHAR(26) PRIMARY KEY,
    tenant_id           VARCHAR(26) NOT NULL REFERENCES tenants(id),
    user_id             VARCHAR(26) NOT NULL REFERENCES tenant_users(id),
    conversation_id     VARCHAR(26),                -- groups follow-up turns
    turn_number         INTEGER DEFAULT 1,
    input_text          TEXT NOT NULL,               -- user's natural language
    normalized_text     TEXT NOT NULL,               -- normalized for caching
    model_id            VARCHAR(26) REFERENCES semantic_models(id),
    response_json       JSONB NOT NULL,              -- full LLM response
    query_definition    JSONB,                       -- resolved QueryDefinition
    llm_provider        VARCHAR(50) NOT NULL,        -- claude, openai, ollama
    llm_model           VARCHAR(100) NOT NULL,       -- haiku, gpt-4o-mini, etc.
    input_tokens        INTEGER,
    output_tokens       INTEGER,
    latency_ms          INTEGER,
    confidence          VARCHAR(10),                 -- high, medium, low
    validation_passed   BOOLEAN DEFAULT true,
    cache_hit           BOOLEAN DEFAULT false,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_nlq_queries_tenant ON nlq_queries(tenant_id);
CREATE INDEX idx_nlq_queries_conversation ON nlq_queries(conversation_id);
CREATE INDEX idx_nlq_queries_created ON nlq_queries(created_at);

-- NLQ usage tracking per tenant (for plan quota enforcement)
CREATE TABLE nlq_usage (
    tenant_id           VARCHAR(26) NOT NULL REFERENCES tenants(id),
    month               DATE NOT NULL,               -- first day of month
    query_count         INTEGER DEFAULT 0,
    cache_hit_count     INTEGER DEFAULT 0,
    total_input_tokens  INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cost_cents    INTEGER DEFAULT 0,            -- estimated cost in cents
    PRIMARY KEY (tenant_id, month)
);
```

---

## API Endpoints

```
POST /api/nlq/query
  Body: { text: string, conversationId?: string, modelId?: string }
  Returns: { queryDefinition, chartType, title, confidence, clarification? }
  Auth: JWT required
  Rate limit: per plan quota

GET /api/nlq/suggestions
  Query: ?modelId=...
  Returns: { suggestions: string[] }
  Auth: JWT required
  Cached: per model version

GET /api/nlq/history
  Query: ?limit=20&offset=0
  Returns: { queries: NLQQuery[] }
  Auth: JWT required

GET /api/nlq/usage
  Returns: { used: number, limit: number, resetAt: date }
  Auth: JWT required
```

---

## Implementation Phases

### Phase A: Core NLQ (Weeks 1-2)

| # | Task | Deliverable |
|---|------|-------------|
| A.1 | NLQ NestJS module scaffold | Module, controller, service |
| A.2 | LLM provider interface + Claude Haiku implementation | Working LLM calls |
| A.3 | Prompt construction from semantic model | Context assembly |
| A.4 | Response parsing + Zod validation | Validated QueryDefinition output |
| A.5 | Model slug → ID resolution | Connect NLQ output to query engine |
| A.6 | Retry logic (validation failure → retry with error context) | Resilient pipeline |
| A.7 | Basic query cache (Redis, exact match) | Cache hits for repeated queries |
| A.8 | API endpoint: POST /api/nlq/query | Working E2E |
| A.9 | Frontend: NLQ input bar component | Text input + submit |
| A.10 | Frontend: result rendering (reuse WidgetRenderer) | Chart appears from NL query |

**Exit criteria:** User types a question → gets a chart. Works for single-turn queries.

### Phase B: Conversation + Refinement (Weeks 3-5)

| # | Task | Deliverable |
|---|------|-------------|
| B.1 | Conversation state management (Redis) | Multi-turn context |
| B.2 | Follow-up prompt template (include previous QD) | Refined queries work |
| B.3 | Frontend: conversation UI (chat-like thread) | Turn history visible |
| B.4 | "Save as Widget" button on NLQ results | Persist to dashboard |
| B.5 | "Edit in Query Builder" button (pre-fill from QD) | Fallback to manual |
| B.6 | Auto-model selection (multi-model tenants) | Picks the right model |
| B.7 | Clarification UI (confidence: low → ask user) | Handles ambiguity |
| B.8 | Suggested queries (generated per model) | Empty-state help |

**Exit criteria:** Multi-turn conversations work. User can refine, save, or fall back to query builder.

### Phase C: Providers + Scaling (Weeks 6-8)

| # | Task | Deliverable |
|---|------|-------------|
| C.1 | LLM provider interface + factory pattern | Pluggable provider system |
| C.2 | Groq Cloud provider | Fastest inference (primary default) |
| C.3 | OpenAI provider | Reliable fallback |
| C.4 | OpenRouter provider | Universal model gateway |
| C.5 | Ollama provider | Self-hosted / air-gapped option |
| C.6 | Custom endpoint provider (OpenAI-compat) | Tenant's own AI pipeline |
| C.7 | Provider resolution chain + failover | Primary → fallback chain |
| C.8 | BYOK (Bring Your Own Key) tenant config UI | Tenant manages own keys/endpoints |
| C.9 | Provider health check + test connection | Verify before enabling |
| C.10 | Usage tracking (nlq_usage table) | Metered per tenant |
| C.11 | Plan quota enforcement | Rate limiting per plan |
| C.12 | Normalized query cache + TTL management | Higher cache hit rate |
| C.13 | NLQ analytics dashboard (admin: usage, latency, accuracy) | Observability |
| C.14 | Custom endpoint adapter docs + example | Help tenants integrate |

**Exit criteria:** 6 LLM providers working, tenants can BYOK or use custom
endpoints, usage tracking and plan quotas enforced.

### Phase D: Advanced Features (Weeks 8-9)

| # | Task | Deliverable |
|---|------|-------------|
| D.1 | Semantic similarity cache (embeddings) | Near-miss cache hits |
| D.2 | Query explanation ("Here's what I did: ...") | Transparency |
| D.3 | Comparison queries ("this quarter vs last quarter") | Period comparison |
| D.4 | Top-N queries ("top 10 customers by revenue") | Ranking |
| D.5 | Anomaly queries ("anything unusual this week?") | Simple anomaly detection |
| D.6 | Multi-language support (prompts in user's locale) | i18n |

**Exit criteria:** Smart caching, comparisons, anomaly detection, multi-language.

---

## Cost Analysis

### Per-Query Cost (Claude Haiku)

```
Prompt size:
  System prompt:     ~500 tokens
  Model context:     ~500-2000 tokens (depends on model size)
  Conversation:      ~200 tokens per previous turn
  User message:      ~20-50 tokens
  Total input:       ~1200-2800 tokens

Response size:
  JSON output:       ~200-400 tokens

Cost per query:
  Input:  2000 tokens × $0.25/M = $0.0005
  Output: 300 tokens × $1.25/M  = $0.000375
  Total:  ~$0.001 per query (0.1 cents)

With cache (estimated 40% hit rate):
  Effective cost: ~$0.0006 per query
```

### Monthly Cost at Scale

| Tenants | Queries/month | Cache rate | LLM cost | Infra cost |
|---------|--------------|------------|----------|------------|
| 10 | 2,000 | 30% | $1.40 | $0 |
| 50 | 15,000 | 40% | $9.00 | $0 |
| 200 | 80,000 | 50% | $40.00 | $5 (Redis) |
| 1000 | 500,000 | 60% | $200.00 | $20 (Redis) |

NLQ is **extremely cheap** to operate because:
1. Small prompts (the semantic model is compact)
2. Small responses (structured JSON, not prose)
3. High cache hit rate (people ask similar questions)
4. Small model sufficient (classification, not generation)

### Revenue Offset

At $0.001/query, even the free tier cost is negligible. The feature drives
upgrades from Free → Starter (50 queries) → Pro (500 queries) → Business
(unlimited). A single Starter upgrade ($29/mo) covers 29,000 queries of LLM
cost.

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Prompt injection** | User input is placed in a clearly delimited `USER QUERY:` block. The LLM's output is validated against the model — it cannot reference tables/columns outside the semantic model. Even if the LLM is tricked, the query engine rejects invalid metric/dimension slugs. |
| **Data leakage across tenants** | Each NLQ call only includes the current tenant's semantic model in the prompt. No cross-tenant data in context. |
| **LLM sees sensitive schema** | The LLM sees metric/dimension names and descriptions (business labels), NOT raw table names, column names, or connection strings. The semantic model is an abstraction layer. |
| **API key security** | BYOK keys are encrypted at rest (same as connector credentials — AES-256-GCM). Platform keys are server-side only, never exposed to the frontend. |
| **Cost runaway** | Hard per-tenant monthly quota. Rate limiting on the API endpoint. Alert when any tenant exceeds 80% of quota. |
| **Denial of service** | NLQ endpoint has its own rate limiter (stricter than CRUD endpoints). Timeout on LLM calls (10s). Circuit breaker if provider is down. |

---

## Testing Strategy

### Unit Tests

- Prompt construction: verify context includes all metrics/dimensions
- Response parsing: test with valid, invalid, partial, and malformed JSON
- Validation: test slug resolution, type checking, unknown metric rejection
- Normalization: test query normalization for cache key consistency
- Cost estimation: verify token counting

### Integration Tests

- Full flow: NL input → LLM call (mocked) → QueryDefinition → SQL → results
- Conversation: multi-turn with context preservation
- Cache: verify cache hit/miss behavior
- Provider failover: primary fails → secondary succeeds
- Rate limiting: verify quota enforcement

### Accuracy Tests (LLM Quality)

Maintain a test suite of ~100 natural language queries with expected outputs:

```typescript
const NLQ_TEST_SUITE = [
  {
    input: "total revenue this year",
    expected: {
      metrics: ["revenue"],
      dimensions: [],
      filters: [{ field: "order_date", operator: "gte", value: "2026-01-01" }],
      chartType: "kpi_card",
    },
  },
  {
    input: "monthly revenue by region",
    expected: {
      metrics: ["revenue"],
      dimensions: ["region", { slug: "order_date", granularity: "month" }],
      chartType: "bar_chart",
    },
  },
  // ... 98 more test cases
];
```

Run against each LLM provider/model to measure accuracy before deploying
model changes. Target: 95%+ accuracy on the test suite.

---

## Metrics & Observability

| Metric | Description |
|--------|-------------|
| `nlq_query_total` | Total NLQ queries (by tenant, provider, cache_hit) |
| `nlq_query_latency_ms` | End-to-end latency (p50, p95, p99) |
| `nlq_llm_latency_ms` | LLM call latency only |
| `nlq_cache_hit_rate` | Cache hit ratio |
| `nlq_validation_failure_rate` | How often the LLM returns invalid output |
| `nlq_confidence_distribution` | high/medium/low confidence breakdown |
| `nlq_retry_rate` | How often we retry after validation failure |
| `nlq_cost_total` | Estimated LLM cost (by tenant, provider) |
| `nlq_conversation_turns_avg` | Average turns per conversation |

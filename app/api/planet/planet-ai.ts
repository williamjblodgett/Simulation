import { env } from "cloudflare:workers";

import { getD1 } from "@/db";
import {
  applyExternalAgentCounsel,
  type ExternalAgentCounselInput,
} from "@/app/simulation/planet";
import type {
  GoalKind,
  PlanetAgent,
  PlanetWorldState,
  ProposalKind,
} from "@/app/simulation/planet/types";

const WORLD_ID = "canonical-era-3";
const MODEL = "gpt-5.4-mini-2026-03-17";
const COUNSEL_INTERVAL_DAYS = 25;
const FIRST_COUNSEL_DAY = 5;
const DAILY_CALL_LIMIT = 12;
const LEASE_MS = 90_000;
const FAILURE_BACKOFF_MS = 15 * 60_000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_OUTPUT_TOKENS = 900;

const COUNSEL_GOALS = [
  "secure_water",
  "secure_food",
  "defend",
  "explore",
  "research",
  "prosper",
] as const satisfies readonly GoalKind[];

const COUNSEL_PROPOSALS = [
  "family",
  "trade",
  "migration",
  "construction",
  "research",
  "law",
  "alliance",
  "war",
  "peace",
  "leadership",
  "belief_reform",
] as const satisfies readonly ProposalKind[];

type Database = ReturnType<typeof getD1>;

interface CounselStateRow {
  lastCompletedDay: number;
  dailyBucket: number;
  dailyCalls: number;
  consecutiveFailures: number;
  lastRequestId: string | null;
}

interface OpenAIResponse {
  id?: unknown;
  output_text?: unknown;
  output?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
}

export interface PlanetAiCounselStatus {
  configured: boolean;
  model: string;
  activeSlots: number;
  topAgentIds: string[];
  lastCompletedDay: number | null;
  callsToday: number;
  dailyCallLimit: number;
  consecutiveFailures: number;
}

export interface PreparedPlanetCounsel {
  runId: string;
  model: string;
  day: number;
  agentIds: string[];
  decisions: ExternalAgentCounselInput[];
  requestId: string | null;
  inputTokens: number;
  outputTokens: number;
}

function runtimeSecret(): string | null {
  const value = (env as unknown as Record<string, unknown>).OPENAI_API_KEY;
  return typeof value === "string" && value.startsWith("sk-") && value.length >= 24
    ? value
    : null;
}

function changes(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const value = (result as { meta?: { changes?: unknown } }).meta?.changes;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? Math.max(0, numeric) : 0;
}

function boundedInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function topAgents(world: PlanetWorldState): PlanetAgent[] {
  return world.agents
    .filter(({ alive }) => alive)
    .sort((left, right) => right.influence - left.influence || left.id.localeCompare(right.id))
    .slice(0, 5);
}

function compactAgentFacts(agent: PlanetAgent, simulationDay: number) {
  const activeGoal = agent.mind.goals.find(({ status }) => status === "active") ?? null;
  return {
    id: agent.id,
    name: agent.name,
    ageDays: Math.max(0, Math.floor(simulationDay - agent.birthDay)),
    influence: Number(agent.influence.toFixed(2)),
    needs: Object.fromEntries(
      Object.entries(agent.needs).map(([key, value]) => [key, Number(value.toFixed(2))]),
    ),
    homeSettlementId: agent.homeSettlementId,
    polityId: agent.polityId,
    beliefId: agent.beliefId,
    capabilities: agent.capabilities.slice(0, 16),
    inventory: Object.entries(agent.inventory)
      .filter(([, amount]) => amount > 0)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12),
    currentGoal: activeGoal
      ? {
          purpose: activeGoal.purpose,
          targetId: activeGoal.targetId,
          confidence: Number(activeGoal.confidence.toFixed(2)),
        }
      : null,
    knownSubjects: agent.mind.observations
      .slice(-20)
      .map(({ subjectId, kind, confidence, facts }) => ({
        subjectId,
        kind,
        confidence: Number(confidence.toFixed(2)),
        facts: Object.fromEntries(Object.entries(facts).slice(0, 4)),
      })),
    recentLearning: agent.mind.contextualLearning
      .slice(-8)
      .map(({ key, attempts, expectedValue }) => ({ key, attempts, expectedValue })),
  };
}

function responseText(payload: OpenAIResponse): string | null {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const candidate = part as { type?: unknown; text?: unknown };
      if (candidate.type === "output_text" && typeof candidate.text === "string") {
        return candidate.text;
      }
    }
  }
  return null;
}

function parseDecisions(text: string, expectedIds: readonly string[]): ExternalAgentCounselInput[] {
  const parsed = JSON.parse(text) as { decisions?: unknown };
  if (!Array.isArray(parsed.decisions) || parsed.decisions.length !== expectedIds.length) {
    throw new Error("The model did not return one bounded decision per eligible agent.");
  }
  const expected = new Set(expectedIds);
  const seen = new Set<string>();
  const decisions: ExternalAgentCounselInput[] = [];
  for (const value of parsed.decisions) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("A counsel decision was malformed.");
    }
    const candidate = value as Record<string, unknown>;
    const agentId = typeof candidate.agentId === "string" ? candidate.agentId : "";
    const goalKind = typeof candidate.goalKind === "string" ? candidate.goalKind : "";
    const proposalIntent = candidate.proposalIntent;
    const targetId = candidate.targetId;
    const reasoning = typeof candidate.reasoning === "string" ? candidate.reasoning.trim() : "";
    if (!expected.has(agentId) || seen.has(agentId)) throw new Error("Counsel agent IDs did not match the eligible set.");
    if (!(COUNSEL_GOALS as readonly string[]).includes(goalKind)) throw new Error("Counsel used an unsupported goal.");
    if (proposalIntent !== null && !(COUNSEL_PROPOSALS as readonly unknown[]).includes(proposalIntent)) {
      throw new Error("Counsel used an unsupported proposal intent.");
    }
    if (targetId !== null && typeof targetId !== "string") throw new Error("Counsel used an invalid target.");
    if (reasoning.length < 1 || reasoning.length > 240) throw new Error("Counsel reasoning was outside its bounds.");
    seen.add(agentId);
    decisions.push({
      agentId,
      goalKind: goalKind as GoalKind,
      proposalIntent: proposalIntent as ProposalKind | null,
      targetId: targetId as string | null,
      reasoning,
    });
  }
  return decisions;
}

async function acquireLease(
  database: Database,
  day: number,
  serverTime: number,
): Promise<boolean> {
  const bucket = Math.floor(serverTime / 86_400_000);
  await database
    .prepare(`
      INSERT OR IGNORE INTO planet_ai_counsel_state (
        world_id, daily_bucket, updated_at
      ) VALUES (?, ?, CURRENT_TIMESTAMP)
    `)
    .bind(WORLD_ID, bucket)
    .run();
  const result = await database
    .prepare(`
      UPDATE planet_ai_counsel_state
      SET
        lease_until_ms = ?,
        last_started_day = ?,
        daily_calls = CASE WHEN daily_bucket = ? THEN daily_calls + 1 ELSE 1 END,
        daily_bucket = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE world_id = ?
        AND lease_until_ms < ?
        AND ? >= ?
        AND ? >= last_completed_day + ?
        AND ? >= last_started_day + 1
        AND (daily_bucket <> ? OR daily_calls < ?)
    `)
    .bind(
      serverTime + LEASE_MS,
      day,
      bucket,
      bucket,
      WORLD_ID,
      serverTime,
      day,
      FIRST_COUNSEL_DAY,
      day,
      COUNSEL_INTERVAL_DAYS,
      day,
      bucket,
      DAILY_CALL_LIMIT,
    )
    .run();
  return changes(result) === 1;
}

async function requestCounsel(
  secret: string,
  world: PlanetWorldState,
  agents: readonly PlanetAgent[],
): Promise<Omit<PreparedPlanetCounsel, "runId" | "day" | "agentIds" | "model">> {
  const expectedIds = agents.map(({ id }) => id);
  const input = JSON.stringify({
    simulationDay: world.day,
    mission: "Survive and prosper without overriding personal consent or local knowledge.",
    agents: agents.map((agent) => compactAgentFacts(agent, world.day)),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        safety_identifier: "wildgrid-era-3-counsel",
        input: [
          {
            role: "developer",
            content: [{
              type: "input_text",
              text: "You are a bounded strategic adviser inside a deterministic civilization simulation. Return exactly one option for each supplied agent. Use only supplied facts and known subject IDs. Advice is nonbinding: agents independently score it against survival, learned experience, commitments, consent, and local knowledge. Never claim the agents are conscious. Keep each reason concrete and under 240 characters.",
            }],
          },
          { role: "user", content: [{ type: "input_text", text: input }] },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "wildgrid_agent_counsel",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                decisions: {
                  type: "array",
                  minItems: expectedIds.length,
                  maxItems: expectedIds.length,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      agentId: { type: "string", enum: expectedIds },
                      goalKind: { type: "string", enum: COUNSEL_GOALS },
                      proposalIntent: { anyOf: [{ type: "string", enum: COUNSEL_PROPOSALS }, { type: "null" }] },
                      targetId: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
                      reasoning: { type: "string", minLength: 1, maxLength: 240 },
                    },
                    required: ["agentId", "goalKind", "proposalIntent", "targetId", "reasoning"],
                  },
                },
              },
              required: ["decisions"],
            },
          },
        },
      }),
      signal: controller.signal,
    });
    const requestId = response.headers.get("x-request-id");
    if (!response.ok) throw new Error(`OpenAI counsel request failed with status ${response.status}.`);
    const payload = await response.json() as OpenAIResponse;
    const text = responseText(payload);
    if (!text) throw new Error("OpenAI counsel response had no structured output.");
    return {
      decisions: parseDecisions(text, expectedIds),
      requestId: requestId ?? (typeof payload.id === "string" ? payload.id : null),
      inputTokens: boundedInteger(payload.usage?.input_tokens),
      outputTokens: boundedInteger(payload.usage?.output_tokens),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function preparePlanetAiCounsel(
  database: Database,
  world: PlanetWorldState,
  serverTime: number,
): Promise<PreparedPlanetCounsel | null> {
  const secret = runtimeSecret();
  const agents = topAgents(world);
  if (!secret || agents.length === 0 || !(await acquireLease(database, world.day, serverTime))) return null;
  const runId = crypto.randomUUID();
  try {
    const response = await requestCounsel(secret, world, agents);
    return {
      runId,
      model: MODEL,
      day: world.day,
      agentIds: agents.map(({ id }) => id),
      ...response,
    };
  } catch {
    await database.batch([
      database.prepare(`
        UPDATE planet_ai_counsel_state
        SET lease_until_ms = ?, consecutive_failures = MIN(1000, consecutive_failures + 1), updated_at = CURRENT_TIMESTAMP
        WHERE world_id = ?
      `).bind(serverTime + FAILURE_BACKOFF_MS, WORLD_ID),
      database.prepare(`
        INSERT OR IGNORE INTO planet_ai_counsel_log (
          world_id, run_id, world_revision, day, model, status,
          agent_ids_json, decisions_json, payload_bytes, request_id,
          input_tokens, output_tokens
        ) VALUES (?, ?, ?, ?, ?, 'failed', ?, '[]', 2, NULL, 0, 0)
      `).bind(
        WORLD_ID,
        runId,
        world.revision,
        world.day,
        MODEL,
        JSON.stringify(agents.map(({ id }) => id)),
      ),
    ]);
    return null;
  }
}

export function applyPreparedPlanetCounsel(
  world: PlanetWorldState,
  prepared: PreparedPlanetCounsel,
) {
  return applyExternalAgentCounsel(world, prepared.decisions);
}

export async function finalizePlanetAiCounsel(
  database: Database,
  prepared: PreparedPlanetCounsel,
  worldRevision: number,
  status: "applied" | "rejected",
): Promise<void> {
  const decisionsJson = JSON.stringify(prepared.decisions.map((decision) => ({
    agentId: decision.agentId,
    goalKind: decision.goalKind,
    proposalIntent: decision.proposalIntent ?? null,
    targetId: decision.targetId ?? null,
  })));
  const payloadBytes = new TextEncoder().encode(decisionsJson).byteLength;
  await database.batch([
    database.prepare(`
      UPDATE planet_ai_counsel_state
      SET lease_until_ms = 0, last_completed_day = ?, consecutive_failures = 0,
          last_request_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE world_id = ?
    `).bind(prepared.day, prepared.requestId, WORLD_ID),
    database.prepare(`
      INSERT OR IGNORE INTO planet_ai_counsel_log (
        world_id, run_id, world_revision, day, model, status,
        agent_ids_json, decisions_json, payload_bytes, request_id,
        input_tokens, output_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      WORLD_ID,
      prepared.runId,
      worldRevision,
      prepared.day,
      prepared.model,
      status,
      JSON.stringify(prepared.agentIds),
      decisionsJson,
      payloadBytes,
      prepared.requestId,
      prepared.inputTokens,
      prepared.outputTokens,
    ),
  ]);
}

export async function planetAiCounselStatus(
  database: Database,
  world: PlanetWorldState,
  serverTime = Date.now(),
): Promise<PlanetAiCounselStatus> {
  const row = await database.prepare(`
    SELECT last_completed_day AS lastCompletedDay, daily_bucket AS dailyBucket,
           daily_calls AS dailyCalls, consecutive_failures AS consecutiveFailures,
           last_request_id AS lastRequestId
    FROM planet_ai_counsel_state WHERE world_id = ?
  `).bind(WORLD_ID).first<CounselStateRow>();
  const bucket = Math.floor(serverTime / 86_400_000);
  const configured = Boolean(runtimeSecret());
  return {
    configured,
    model: MODEL,
    activeSlots: configured ? Math.min(5, topAgents(world).length) : 0,
    topAgentIds: topAgents(world).map(({ id }) => id),
    lastCompletedDay: row && Number.isFinite(row.lastCompletedDay) && row.lastCompletedDay >= 0
      ? row.lastCompletedDay
      : null,
    callsToday: row?.dailyBucket === bucket ? boundedInteger(row.dailyCalls) : 0,
    dailyCallLimit: DAILY_CALL_LIMIT,
    consecutiveFailures: boundedInteger(row?.consecutiveFailures),
  };
}

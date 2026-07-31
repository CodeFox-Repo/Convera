import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  LocalAIChatRequest,
  LocalAIStreamEvent,
  LocalAIUsage,
} from "@/shared/types/local-ai";
import { LocalAiRuntime } from "@/electron/ai/runtime";
import { JsonSessionStateRepository } from "@/electron/ai/session/repository";
import { MemoryIntegrationCoordinator } from "@/electron/memory/coordinator";
import {
  buildMemoryEvaluationReport,
  renderMemoryEvaluationHtml,
  type MemoryEvaluationCase,
  type MemoryEvaluationMode,
} from "@/electron/memory/evaluation";
import {
  createLocalMemoryBackend,
  createPersistentMemoryRepositories,
} from "@/electron/memory/runtime-factory";
import { LocalMemoryStore } from "@/electron/memory/store";
import type {
  MemoryPatchOperation,
  MemoryScope,
} from "@/electron/memory/types";

const realCodex = process.argv.includes("--real");
const repetitionsArgument = process.argv.find((argument) =>
  argument.startsWith("--repetitions="),
);
const repetitions = Math.max(
  1,
  Number.parseInt(repetitionsArgument?.split("=")[1] ?? "3", 10) || 3,
);
const runId = new Date().toISOString().replaceAll(/[:.]/g, "-");
const artifactRoot = resolve(".automation", "artifacts", "memory-eval");
const runDirectory = join(artifactRoot, runId);
const latestDirectory = join(artifactRoot, "latest");

function duration(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function estimatedTokens(context: string | undefined): number {
  return Math.ceil((context?.length ?? 0) / 4);
}

function provenance(turnId: string) {
  return {
    actor: "system" as const,
    turnId,
    timestamp: new Date().toISOString(),
    providerId: "codex-cli",
  };
}

async function apply(
  store: LocalMemoryStore,
  scope: MemoryScope,
  turnId: string,
  operations: MemoryPatchOperation[],
): Promise<void> {
  const snapshot = await store.getSnapshot(scope);
  const result = await store.applyPatch({
    scope,
    baseVersion: snapshot.version,
    turnId,
    provenance: provenance(turnId),
    operations,
  });
  if (result.status !== "applied" && result.status !== "duplicate") {
    throw new Error(`Memory seed ${turnId} was not applied: ${result.message}`);
  }
}

interface DeterministicFixture {
  root: string;
  coordinator: MemoryIntegrationCoordinator;
  store: LocalMemoryStore;
  values: {
    persisted: string;
    correctedOld: string;
    correctedNew: string;
    user: string;
    workspace: string;
    conversation: string;
    forgotten: string;
  };
}

async function createDeterministicFixture(): Promise<DeterministicFixture> {
  const root = await mkdtemp(join(tmpdir(), "convera-memory-eval-"));
  const memoryDirectory = join(root, "memory");
  const backendPath = join(memoryDirectory, "local-provider.json");
  const repositories = createPersistentMemoryRepositories({
    directory: memoryDirectory,
  });
  await repositories.settings.update({
    provider: "local",
    curator: "off",
  });
  const store = new LocalMemoryStore({
    backend: createLocalMemoryBackend(backendPath),
    indexRepository: repositories.indexes,
    sourceId: repositories.settings.getSourceId(),
  });
  await store.initialize();
  const values = {
    persisted: `PERSIST-${randomUUID()}`,
    correctedOld: `OLD-${randomUUID()}`,
    correctedNew: `NEW-${randomUUID()}`,
    user: `USER-${randomUUID()}`,
    workspace: `WORKSPACE-${randomUUID()}`,
    conversation: `CONVERSATION-${randomUUID()}`,
    forgotten: `FORGOTTEN-${randomUUID()}`,
  };
  const conversationA: MemoryScope = { kind: "conversation", id: "conv-a" };
  const userScope: MemoryScope = { kind: "user", id: "eval-user" };
  const workspaceA: MemoryScope = { kind: "workspace", id: "workspace-a" };

  await apply(store, conversationA, "seed-persisted", [
    {
      type: "upsert_block",
      label: "persisted_fact",
      value: values.persisted,
    },
  ]);
  await apply(store, conversationA, "seed-correction", [
    {
      type: "upsert_block",
      label: "corrected_fact",
      value: values.correctedOld,
    },
  ]);
  await apply(store, conversationA, "update-correction", [
    {
      type: "upsert_block",
      label: "corrected_fact",
      value: values.correctedNew,
    },
  ]);
  await apply(store, userScope, "seed-user", [
    { type: "upsert_block", label: "user_fact", value: values.user },
  ]);
  await apply(store, workspaceA, "seed-workspace", [
    {
      type: "upsert_block",
      label: "workspace_fact",
      value: values.workspace,
    },
  ]);
  await apply(store, conversationA, "seed-conversation", [
    {
      type: "upsert_block",
      label: "conversation_fact",
      value: values.conversation,
    },
  ]);
  await apply(store, conversationA, "seed-forget", [
    {
      type: "upsert_block",
      label: "forgotten_fact",
      value: values.forgotten,
    },
  ]);
  const forgotten = await store.forget({
    scope: conversationA,
    target: { type: "block", label: "forgotten_fact" },
    reason: "Evaluation verifies explicit forgetting.",
    turnId: "forget-fact",
    approved: true,
  });
  if (forgotten.status !== "forgotten") {
    throw new Error(`Memory forget failed: ${forgotten.message}`);
  }

  const restartedStore = new LocalMemoryStore({
    backend: createLocalMemoryBackend(backendPath),
    indexRepository: createPersistentMemoryRepositories({
      directory: memoryDirectory,
    }).indexes,
    sourceId: repositories.settings.getSourceId(),
  });
  await restartedStore.initialize();
  const restartedSnapshot = await restartedStore.getSnapshot(conversationA);
  if (
    !restartedSnapshot.blocks.some((block) => block.value === values.persisted)
  ) {
    throw new Error("Memory did not survive a backend/repository restart.");
  }
  await restartedStore.quiesce();

  const coordinator = new MemoryIntegrationCoordinator({
    settingsRepository: repositories.settings,
    indexRepository: repositories.indexes,
    jobRepository: repositories.jobs,
    candidateRepository: repositories.candidates,
    backendFactory: () =>
      Promise.resolve(createLocalMemoryBackend(backendPath)),
    curatorFactory: {
      create: () => {
        throw new Error("The deterministic evaluation never enables curation.");
      },
    },
    userScopeId: "eval-user",
    resolveWorkspaceScopeId: (input) =>
      input.workingDirectory ?? "workspace-default",
  });
  return { root, coordinator, store, values };
}

async function preparedContext(
  fixture: DeterministicFixture,
  mode: MemoryEvaluationMode,
  input: { conversationId: string; workspaceId: string },
): Promise<{ context: string; durationMs: number; tools: number }> {
  await fixture.coordinator.updateMemorySettings({
    provider: mode,
    subconsciousProvider: "off",
  });
  const startedAt = performance.now();
  const prepared = await fixture.coordinator.prepareTurn({
    turnId: randomUUID(),
    conversationId: input.conversationId,
    providerId: "codex-cli",
    revision: 0,
    workingDirectory: input.workspaceId,
    isNewSession: true,
    requestApproval: async () => false,
  });
  return {
    context: prepared.systemContext ?? "",
    durationMs: duration(startedAt),
    tools: prepared.additionalTools.length,
  };
}

async function deterministicCases(): Promise<MemoryEvaluationCase[]> {
  const fixture = await createDeterministicFixture();
  const cases: MemoryEvaluationCase[] = [];
  try {
    for (const mode of ["off", "local"] as const) {
      const primary = await preparedContext(fixture, mode, {
        conversationId: "conv-a",
        workspaceId: "workspace-a",
      });
      const otherWorkspace = await preparedContext(fixture, mode, {
        conversationId: "conv-a",
        workspaceId: "workspace-b",
      });
      const otherConversation = await preparedContext(fixture, mode, {
        conversationId: "conv-b",
        workspaceId: "workspace-a",
      });
      const contextDetails = (context: string) => ({
        contextCharacters: context.length,
        estimatedContextTokens: estimatedTokens(context),
      });
      const localContract = (context: string, present: boolean) =>
        mode === "local"
          ? present && context.length > 0 && primary.tools > 0
          : !present && context.length === 0 && primary.tools === 0;
      const add = (entry: Omit<MemoryEvaluationCase, "kind" | "mode">) =>
        cases.push({ ...entry, kind: "deterministic", mode });

      add({
        id: `${mode}-persistent-recall`,
        label: "Cross-restart recall",
        capability: "persistence",
        passed: primary.context.includes(fixture.values.persisted),
        contractPassed: localContract(
          primary.context,
          primary.context.includes(fixture.values.persisted),
        ),
        durationMs: primary.durationMs,
        ...contextDetails(primary.context),
        expected: fixture.values.persisted,
        actual: primary.context.includes(fixture.values.persisted)
          ? fixture.values.persisted
          : "NO_CONTEXT",
      });
      const corrected =
        primary.context.includes(fixture.values.correctedNew) &&
        !primary.context.includes(fixture.values.correctedOld);
      add({
        id: `${mode}-correction`,
        label: "Updated fact supersedes old value",
        capability: "correction",
        passed: corrected,
        contractPassed:
          mode === "local"
            ? corrected
            : !primary.context.includes(fixture.values.correctedNew) &&
              !primary.context.includes(fixture.values.correctedOld),
        durationMs: primary.durationMs,
        ...contextDetails(primary.context),
        expected: fixture.values.correctedNew,
        actual: corrected ? fixture.values.correctedNew : "NO_CONTEXT",
      });
      add({
        id: `${mode}-user-scope`,
        label: "User fact follows the user",
        capability: "user-scope",
        passed: otherConversation.context.includes(fixture.values.user),
        contractPassed:
          mode === "local"
            ? otherConversation.context.includes(fixture.values.user)
            : !otherConversation.context.includes(fixture.values.user),
        durationMs: otherConversation.durationMs,
        ...contextDetails(otherConversation.context),
        expected: fixture.values.user,
        actual: otherConversation.context.includes(fixture.values.user)
          ? fixture.values.user
          : "NO_CONTEXT",
      });
      add({
        id: `${mode}-workspace-isolation`,
        label: "Workspace scope does not leak",
        capability: "workspace-isolation",
        passed: !otherWorkspace.context.includes(fixture.values.workspace),
        contractPassed: !otherWorkspace.context.includes(
          fixture.values.workspace,
        ),
        durationMs: otherWorkspace.durationMs,
        ...contextDetails(otherWorkspace.context),
        expected: "ABSENT",
        actual: otherWorkspace.context.includes(fixture.values.workspace)
          ? "LEAKED"
          : "ABSENT",
      });
      add({
        id: `${mode}-conversation-isolation`,
        label: "Conversation scope does not leak",
        capability: "conversation-isolation",
        passed: !otherConversation.context.includes(
          fixture.values.conversation,
        ),
        contractPassed: !otherConversation.context.includes(
          fixture.values.conversation,
        ),
        durationMs: otherConversation.durationMs,
        ...contextDetails(otherConversation.context),
        expected: "ABSENT",
        actual: otherConversation.context.includes(fixture.values.conversation)
          ? "LEAKED"
          : "ABSENT",
      });
      add({
        id: `${mode}-forget`,
        label: "Forgotten fact stays absent",
        capability: "forget",
        passed: !primary.context.includes(fixture.values.forgotten),
        contractPassed: !primary.context.includes(fixture.values.forgotten),
        durationMs: primary.durationMs,
        ...contextDetails(primary.context),
        expected: "ABSENT",
        actual: primary.context.includes(fixture.values.forgotten)
          ? "LEAKED"
          : "ABSENT",
      });
    }
  } finally {
    await fixture.coordinator.dispose();
    await fixture.store.quiesce();
    await rm(fixture.root, { recursive: true, force: true });
  }
  return cases;
}

async function runCodexTurn(
  runtime: LocalAiRuntime,
  request: LocalAIChatRequest,
): Promise<{
  text: string;
  durationMs: number;
  usage?: LocalAIUsage;
  error?: string;
}> {
  const startedAt = performance.now();
  let text = "";
  let usage: LocalAIUsage | undefined;
  let error: string | undefined;
  await runtime.startChat(request, (event: LocalAIStreamEvent) => {
    if (event.type === "ui-message" && event.chunk.type === "text-delta") {
      text += event.chunk.delta;
    } else if (event.type === "finish") {
      usage = event.usage;
    } else if (event.type === "error") {
      error = `${event.error.code ?? event.error.name}: ${event.error.message}`;
    } else if (event.type === "interaction") {
      void runtime.respondToInteraction(event.requestId, event.interactionId, {
        approved: false,
      });
    }
  });
  return { text: text.trim(), durationMs: duration(startedAt), usage, error };
}

async function realCodexCase(
  mode: MemoryEvaluationMode,
  repetition: number,
  nonce: string,
): Promise<MemoryEvaluationCase> {
  const root = await mkdtemp(join(tmpdir(), `convera-memory-${mode}-`));
  const memoryDirectory = join(root, "memory");
  const backendPath = join(memoryDirectory, "local-provider.json");
  const repositories = createPersistentMemoryRepositories({
    directory: memoryDirectory,
  });
  const conversationId = `eval-${mode}-${repetition}-${randomUUID()}`;
  await repositories.settings.update({ provider: mode, curator: "off" });
  const store = new LocalMemoryStore({
    backend: createLocalMemoryBackend(backendPath),
    indexRepository: repositories.indexes,
    sourceId: repositories.settings.getSourceId(),
  });
  await store.initialize();
  await apply(
    store,
    { kind: "conversation", id: conversationId },
    `seed-real-${repetition}`,
    [{ type: "upsert_block", label: "benchmark_secret", value: nonce }],
  );
  const coordinator = new MemoryIntegrationCoordinator({
    settingsRepository: repositories.settings,
    indexRepository: repositories.indexes,
    jobRepository: repositories.jobs,
    candidateRepository: repositories.candidates,
    backendFactory: () =>
      Promise.resolve(createLocalMemoryBackend(backendPath)),
    curatorFactory: {
      create: () => {
        throw new Error("The real recall benchmark does not run curation.");
      },
    },
    userScopeId: "eval-user",
    resolveWorkspaceScopeId: () => "eval-workspace",
  });
  const sessionRepository = new JsonSessionStateRepository({
    path: join(root, "sessions.json"),
  });
  const runtime = new LocalAiRuntime({
    workingDirectory: root,
    sessionRepository,
    executionPolicy: "text-only",
    turnHooks: {
      prepareTurnContext: (input) => coordinator.prepareTurnContext(input),
    },
  });
  try {
    const result = await runCodexTurn(runtime, {
      requestId: randomUUID(),
      conversationId,
      turnId: randomUUID(),
      providerId: "codex-cli",
      operation: {
        kind: "bootstrap",
        messages: [
          {
            role: "user",
            content:
              "This benchmark may provide a secret in external memory context. Reply with exactly that secret if present. If no secret is present, reply exactly UNKNOWN. Never infer or invent a secret.",
          },
        ],
      },
      options: { cwd: root, temperature: 0 },
    });
    if (result.error) throw new Error(result.error);
    const recalled = result.text.includes(nonce);
    const offContract =
      result.text.toUpperCase().includes("UNKNOWN") && !recalled;
    return {
      id: `${mode}-real-codex-${repetition}`,
      label: `Real Codex exact recall #${repetition + 1}`,
      capability: "real-codex-recall",
      kind: "real-codex",
      mode,
      passed: recalled,
      contractPassed: mode === "local" ? recalled : offContract,
      durationMs: result.durationMs,
      usage: result.usage,
      expected: mode === "local" ? nonce : "UNKNOWN",
      actual: result.text,
      note: "Each mode uses a new Convera conversation and a new provider-native thread.",
    };
  } finally {
    await runtime.dispose();
    await coordinator.dispose();
    await store.quiesce();
    await rm(root, { recursive: true, force: true });
  }
}

async function realCodexCases(): Promise<MemoryEvaluationCase[]> {
  const cases: MemoryEvaluationCase[] = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const nonce = `CONVERA-MEMORY-${randomUUID()}`;
    const order: MemoryEvaluationMode[] =
      repetition % 2 === 0 ? ["off", "local"] : ["local", "off"];
    for (const mode of order) {
      process.stdout.write(
        `Running real Codex ${mode} repetition ${repetition + 1}/${repetitions}...\n`,
      );
      cases.push(await realCodexCase(mode, repetition, nonce));
    }
  }
  return cases;
}

async function writeReport(cases: MemoryEvaluationCase[]): Promise<void> {
  const report = buildMemoryEvaluationReport({
    runId,
    realCodex,
    repetitions: realCodex ? repetitions : 1,
    cases,
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const html = renderMemoryEvaluationHtml(report);
  await Promise.all([
    mkdir(runDirectory, { recursive: true }),
    mkdir(latestDirectory, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(runDirectory, "report.json"), json, "utf8"),
    writeFile(join(runDirectory, "index.html"), html, "utf8"),
    writeFile(join(latestDirectory, "report.json"), json, "utf8"),
    writeFile(join(latestDirectory, "index.html"), html, "utf8"),
  ]);
  process.stdout.write(
    [
      "",
      `Off accuracy: ${(report.summaries.off.accuracy * 100).toFixed(1)}%`,
      `Local accuracy: ${(report.summaries.local.accuracy * 100).toFixed(1)}%`,
      `Accuracy uplift: ${report.comparison.accuracyPercentagePoints} pp`,
      `Local mean latency delta: ${report.comparison.meanLatencyDeltaMs} ms`,
      `Real Codex mean latency delta: ${report.comparison.realCodexMeanLatencyDeltaMs ?? "n/a"} ms`,
      `Real Codex mean input-token delta: ${report.comparison.realCodexMeanInputTokenDelta ?? "n/a"}`,
      `Estimated context token delta: ${report.comparison.meanEstimatedContextTokenDelta}`,
      `Report: ${join(runDirectory, "index.html")}`,
      "",
    ].join("\n"),
  );
  if (
    report.summaries.off.contractAccuracy < 1 ||
    report.summaries.local.contractAccuracy < 1
  ) {
    process.exitCode = 1;
  }
}

const cases = await deterministicCases();
if (realCodex) {
  cases.push(...(await realCodexCases()));
}
await writeReport(cases);

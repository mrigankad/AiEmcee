/**
 * The studio's agent harness: one tool set, several model providers.
 *
 *   claude   Anthropic SDK                 ANTHROPIC_API_KEY (or an `ant auth login` profile)
 *   openai   OpenAI-compatible chat API    OPENAI_API_KEY      model: AIEMCEE_OPENAI_MODEL
 *   grok     xAI, OpenAI-compatible        XAI_API_KEY         model: AIEMCEE_XAI_MODEL
 *
 * Every provider gets the same tools, all scoped to one project directory:
 * list and read files, write project files, run a pipeline stage, and read the
 * timeline. Adding a provider means writing one `turn` function; the tools,
 * the sandbox and the stage runner are shared.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { publish } from "./lib/events.mjs";

export const PROVIDERS = {
  claude: { label: "Claude", env: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"], model: () => process.env.AIEMCEE_CLAUDE_MODEL || "claude-opus-5-5" },
  openai: { label: "OpenAI / Codex", env: ["OPENAI_API_KEY"], base: "https://api.openai.com/v1", model: () => process.env.AIEMCEE_OPENAI_MODEL || "gpt-5" },
  grok: { label: "Grok", env: ["XAI_API_KEY"], base: "https://api.x.ai/v1", model: () => process.env.AIEMCEE_XAI_MODEL || "grok-4" },
};

export function providerStatus() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    label: p.label,
    model: p.model(),
    ready: p.env.some((k) => process.env[k]),
  }));
}

const SYSTEM = `You are the director inside AiEmcee Studio. AiEmcee builds narrated product demo films:
narration.json (the script, one line per scene) -> narrate (TTS, durations are the clock) -> capture
(Playwright records the real app per scenes.mjs) -> compose (AiEmcee Motion picture + sound mix -> out/*.mp4).
video.config.mjs holds the sequence, focus moves, titles, transitions and sound.

You work on one project. Read files before you change them, keep edits small and valid, and keep the
JSON valid. After an edit, run the cheapest stage that shows it: narrate for script changes,
compose with --draft for a quick look, compose with --fast for a deliverable. Images the user attaches
are saved under assets/uploads/ and can be referenced from the config. Be concise.`;

const TOOLS = [
  {
    name: "list_files",
    description: "List files in a directory of the project (relative path, default the project root). Generated folders are summarised.",
    schema: { type: "object", properties: { dir: { type: "string" } }, required: [], additionalProperties: false },
  },
  {
    name: "read_file",
    description: "Read a text file of the project, e.g. narration.json, video.config.mjs, scenes.mjs, work/timeline.json.",
    schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  },
  {
    name: "write_file",
    description: "Replace a project source file with new content. Allowed: .json .mjs .js .ts .tsx .md .css .html outside node_modules and generated folders.",
    schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false },
  },
  {
    name: "run_stage",
    description: "Run a pipeline stage on this project and wait for it. Returns the end of its log.",
    schema: {
      type: "object",
      properties: {
        stage: { type: "string", enum: ["validate", "narrate", "capture", "compose", "film"] },
        flags: { type: "array", items: { type: "string", enum: ["--draft", "--fast", "--sound-only", "--all"] } },
      },
      required: ["stage"],
      additionalProperties: false,
    },
  },
];

const GENERATED = new Set(["node_modules", "tts", "raw", "work", "out"]);
const WRITABLE = /\.(json|mjs|js|ts|tsx|md|css|html)$/i;

/** Resolves `rel` inside `root`, or throws. */
function inside(root, rel = ".") {
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`outside the project: ${rel}`);
  return full;
}

function makeTools(project, runStage) {
  return {
    list_files({ dir = "." }) {
      const full = inside(project, dir);
      return fs
        .readdirSync(full, { withFileTypes: true })
        .map((e) => {
          if (!e.isDirectory()) return `${e.name}  ${fs.statSync(path.join(full, e.name)).size}b`;
          return GENERATED.has(e.name) ? `${e.name}/  (generated)` : `${e.name}/`;
        })
        .join("\n");
    },
    read_file({ path: rel }) {
      const text = fs.readFileSync(inside(project, rel), "utf8");
      return text.length > 60000 ? `${text.slice(0, 60000)}\n... (truncated at 60000 of ${text.length} chars)` : text;
    },
    write_file({ path: rel, content }) {
      const full = inside(project, rel);
      const parts = path.relative(project, full).split(path.sep);
      if (parts.some((p) => GENERATED.has(p)) || !WRITABLE.test(full)) throw new Error(`not a writable source file: ${rel}`);
      if (/\.json$/i.test(full)) JSON.parse(content); // refuse to write broken JSON
      if (/\.m?js$/i.test(full)) {
        // Refuse to write a module that does not parse; the error goes back to the model.
        const tmp = path.join(os.tmpdir(), `aiemcee-agent-${process.pid}-${Date.now()}.mjs`);
        fs.writeFileSync(tmp, content);
        try {
          execFileSync(process.execPath, ["--check", tmp], { stdio: ["ignore", "ignore", "pipe"] });
        } catch (err) {
          throw new Error(`syntax error, file not written:\n${err.stderr?.toString().split("\n").slice(1, 5).join("\n")}`);
        } finally {
          fs.rmSync(tmp, { force: true });
        }
      }
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
      publish("file", { project: path.basename(project), name: rel, by: "rasa" });
      return `wrote ${rel} (${content.length} chars)`;
    },
    async run_stage({ stage, flags = [] }) {
      const job = await runStage(stage, flags);
      return `${stage} ${flags.join(" ")} -> ${job.status} (exit ${job.code})\n${job.log.slice(-4000)}`;
    },
  };
}

async function callTool(tools, name, input) {
  try {
    if (!tools[name]) throw new Error(`unknown tool ${name}`);
    return { ok: true, text: String(await tools[name](input ?? {})) };
  } catch (err) {
    return { ok: false, text: `error: ${err.message}` };
  }
}

const imageBlock = (file) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  const media = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return { media, data: fs.readFileSync(file).toString("base64") };
};

/* ---------------------------------------------------------------- */
/* Claude                                                            */
/* ---------------------------------------------------------------- */
async function claudeTurn({ history, user, images, tools, emit }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.text })),
    {
      role: "user",
      content: [
        ...images.map((f) => {
          const { media, data } = imageBlock(f);
          return { type: "image", source: { type: "base64", media_type: media, data } };
        }),
        { type: "text", text: user },
      ],
    },
  ];
  const toolDefs = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));

  for (let step = 0; step < 24; step++) {
    const res = await client.beta.messages.create({
      model: PROVIDERS.claude.model(),
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      tools: toolDefs,
      messages,
    });
    if (res.stop_reason === "refusal") {
      emit({ type: "text", text: `(declined${res.stop_details?.category ? `: ${res.stop_details.category}` : ""})` });
      return;
    }
    for (const b of res.content) if (b.type === "text" && b.text) emit({ type: "text", text: b.text });
    // Append the whole content, thinking blocks included, unchanged.
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b) => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) return;

    const results = [];
    for (const u of uses) {
      emit({ type: "tool", name: u.name, input: u.input });
      const r = await callTool(tools, u.name, u.input);
      emit({ type: "tool_result", name: u.name, ok: r.ok, text: r.text.slice(0, 600) });
      results.push({ type: "tool_result", tool_use_id: u.id, content: r.text, ...(r.ok ? {} : { is_error: true }) });
    }
    messages.push({ role: "user", content: results });
  }
  emit({ type: "text", text: "(stopped after 24 steps)" });
}

/* ---------------------------------------------------------------- */
/* OpenAI-compatible: OpenAI / Codex models, xAI Grok                */
/* ---------------------------------------------------------------- */
async function openaiTurn(provider, { history, user, images, tools, emit }) {
  const key = provider.env.map((k) => process.env[k]).find(Boolean);
  const messages = [
    { role: "system", content: SYSTEM },
    ...history.map((m) => ({ role: m.role, content: m.text })),
    {
      role: "user",
      content: [
        ...images.map((f) => {
          const { media, data } = imageBlock(f);
          return { type: "image_url", image_url: { url: `data:${media};base64,${data}` } };
        }),
        { type: "text", text: user },
      ],
    },
  ];
  const toolDefs = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema } }));

  for (let step = 0; step < 24; step++) {
    const r = await fetch(`${provider.base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: provider.model(), messages, tools: toolDefs }),
    });
    if (!r.ok) throw new Error(`${provider.label} ${r.status}: ${(await r.text()).slice(0, 400)}`);
    const msg = (await r.json()).choices[0].message;
    if (msg.content) emit({ type: "text", text: msg.content });
    messages.push(msg);
    if (!msg.tool_calls?.length) return;
    for (const call of msg.tool_calls) {
      let input = {};
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {}
      emit({ type: "tool", name: call.function.name, input });
      const res = await callTool(tools, call.function.name, input);
      emit({ type: "tool_result", name: call.function.name, ok: res.ok, text: res.text.slice(0, 600) });
      messages.push({ role: "tool", tool_call_id: call.id, content: res.text });
    }
  }
  emit({ type: "text", text: "(stopped after 24 steps)" });
}

/**
 * Runs one chat turn: the model may call tools any number of times.
 * `history` is the visible transcript [{ role, text }], `images` absolute paths.
 */
export async function chatTurn({ provider = "claude", project, history, user, images = [], runStage, emit }) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`unknown provider ${provider}`);
  const tools = makeTools(project, runStage);
  const args = { history, user, images, tools, emit };
  if (provider === "claude") return claudeTurn(args);
  if (!p.env.some((k) => process.env[k])) throw new Error(`${p.label} needs ${p.env.join(" or ")} in the environment`);
  return openaiTurn(p, args);
}

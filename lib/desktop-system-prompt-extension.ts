/**
 * Inline pi extension: clear the system prompt entirely when no tools are active.
 *
 * Pi 0.86+ builds the system prompt as structured sections that are re-derived from
 * `_baseSystemPromptOptions` at every prompt, so mutating `agent.state.systemPrompt`
 * (read-only now) or the transcript is overwritten before the first request. The
 * supported mechanism is `before_agent_start`: setting `forceSystemPrompt` replaces
 * the whole prompt for the run, so an empty tools allowlist (`noTools: "all"`) gets
 * a truly empty system prompt instead of pi's default coding-assistant persona.
 */
import type { ExtensionAPI, ExtensionFactory, InlineExtension } from "@earendil-works/pi-coding-agent";

export function createNoToolsPromptFactory(): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.on("before_agent_start", (event) => {
      if (event.systemPromptOptions.selectedTools.length > 0) return;
      event.systemPromptOptions.forceSystemPrompt = "";
    });
  };
}

export function noToolsPromptInlineExtension(): InlineExtension {
  return {
    name: "desktop-no-tools-prompt",
    factory: createNoToolsPromptFactory(),
  };
}

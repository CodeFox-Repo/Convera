// useCommands Hook - Manages command initialization and execution
// This hook centralizes command definitions and provides access to chat context
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { LanguagesIcon, NotebookPen } from "lucide-react";
import React, { useCallback, useMemo } from "react";

export enum appType {
  common = "common",
  "web-browser" = "web-browser",
}

export interface CommandResult {
  id: string;
  name: string;
  description: string;
  content?: string;
  icon: string | React.ReactNode;
  // default is mcp, input-changed-command means the command is triggered by input change
  // direct command means display immediately under specific situation
  type?: "chat-shortcut-command" | "mcp" | "input-changed-command";
  category?: appType[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute?: (input?: string) => Promise<any>;
}

export interface appCategory {
  name: appType;
  apps: string[];
  commands: CommandResult[];
}

export const useCommands = () => {
  const { setSelectedContent, sendMessage } = useChatContext();

  // Input-needed commands that require user input
  const inputNeededCommands: CommandResult[] = useMemo(
    () => [
      {
        id: "translate",
        name: "Google Translate",
        description: "Translate text between languages",
        icon: React.createElement(LanguagesIcon),
        type: "input-changed-command",
        category: [appType.common],
        execute: async (input?: string) => {
          console.log("called translate command", input);
          if (!input || !input.trim()) {
            return "Please enter text to translate";
          }

          try {
            // Use Google Translate API via a free service
            const response = await fetch(
              `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(input)}`,
            );

            if (!response.ok) {
              throw new Error("Translation failed");
            }

            const data = await response.json();
            const translatedText = data[0][0][0];
            const detectedLanguage = data[2] || "unknown";

            return `${translatedText} (from ${detectedLanguage})`;
          } catch (error) {
            console.error("Translation error:", error);
            return `Translation failed: ${input}`;
          }
        },
      },
    ],
    [],
  );

  // Direct commands that execute immediately
  const directCommands: CommandResult[] = useMemo(
    () => [
      {
        id: "Summary",
        name: "Summary",
        description: "Summarize Current Page",
        icon: React.createElement(NotebookPen),
        type: "chat-shortcut-command",
        content: "Summarize current active page for me",
        category: [appType["web-browser"]],
        execute: async (input?: string) => {
          console.log("called summarize command", input);

          try {
            const summaryPrompt = `<CdFxSummary>I need you to help me summarize the current page content. 
          Please base your summary solely on the "current app context" available in your context - don't perform external searches or fetches, just extract key points directly from the information you have.

          Please format your response in Markdown with:
          - **Page Overview**: One sentence describing what this page is about
          - **Core Points**: List the 3-5 most important pieces of information  
          - **Next Steps** (optional): 1-2 suggestions for actions or further consideration</CdFxSummary>`;

            setSelectedContent(null);
            sendMessage(summaryPrompt);

            return "Summary request sent to chat";
          } catch (error) {
            return `Summary failed: ${error}`;
          }
        },
      },
    ],
    [setSelectedContent, sendMessage],
  );

  // Combined preset commands
  const presetCommands: CommandResult[] = useMemo(
    () => [...directCommands, ...inputNeededCommands],
    [directCommands, inputNeededCommands],
  );

  // Preset categories for different app types
  const presetCategories: appCategory[] = useMemo(
    () => [
      {
        name: appType.common,
        apps: ["*"],
        commands: presetCommands.filter((command) =>
          command.category?.includes(appType.common),
        ),
      },
      {
        name: appType["web-browser"],
        apps: ["Microsoft Edge", "Google Chrome", "Firefox"],
        commands: presetCommands.filter((command) =>
          command.category?.includes(appType["web-browser"]),
        ),
      },
    ],
    [presetCommands],
  );

  // Get filtered commands based on previous app
  const getFilteredCommands = useCallback(
    (previousApp?: string): CommandResult[] => {
      if (previousApp) {
        const matchedCategories = presetCategories.filter((category) => {
          if (category.apps.includes("*")) {
            return true;
          }
          return category.apps.some((app) =>
            app.toLowerCase().includes(previousApp.toLowerCase()),
          );
        });

        const availableCommands: CommandResult[] = [];
        matchedCategories.forEach((category) => {
          if (category.name !== appType.common) {
            category.commands.forEach((command) => {
              if (
                !availableCommands.find(
                  (existing) => existing.id === command.id,
                )
              ) {
                availableCommands.push(command);
              }
            });
          }
        });

        const commonCategory = presetCategories.find(
          (cat) => cat.name === appType.common,
        );
        if (commonCategory) {
          availableCommands.push(...commonCategory.commands);
        }
        return availableCommands;
      } else {
        const commonCategory = presetCategories.find(
          (cat) => cat.name === appType.common,
        );
        return commonCategory ? commonCategory.commands : [];
      }
    },
    [presetCategories],
  );

  // Find command content by command name or ID
  const findCommandContent = useCallback(
    (commandName: string) => {
      const command = presetCommands.find(
        (cmd) => cmd.id === commandName || cmd.name === commandName,
      );
      return command?.content || "";
    },
    [presetCommands],
  );

  return {
    inputNeededCommands,
    directCommands,
    presetCommands,
    presetCategories,
    getFilteredCommands,
    appType,
    findCommandContent,
  };
};

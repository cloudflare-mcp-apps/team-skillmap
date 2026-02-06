import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { Env } from "./types";
import type { Props } from "./auth/props";
import { loadHtml } from "./helpers/assets";
import { UI_RESOURCES, UI_MIME_TYPE } from "./resources/ui-resources";
import { SERVER_INSTRUCTIONS } from "./server-instructions";
import { TOOL_METADATA, getToolDescription } from "./tools/descriptions";
import { MapTeamInput, type MapTeamParams, computeTeamGraph } from "./tools/map-team";
import { AnalyzeSkillInput, type AnalyzeSkillParams, analyzeSkill } from "./tools/analyze-skill";
import { MapTeamOutputSchema, AnalyzeSkillOutputSchema } from "./schemas/outputs";
import { logger } from "./shared/logger";

export class TeamSkillmap extends McpAgent<Env, unknown, Props> {
  // @ts-expect-error - McpServer version mismatch between @modelcontextprotocol/sdk and agents bundled SDK
  server = new McpServer(
    {
      name: "team-skillmap",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        prompts: { listChanged: true },
        resources: { listChanged: true },
      },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  async init() {
    const widgetResource = UI_RESOURCES.widget;

    // PART 1: Register UI Resource
    this.server.registerResource(
      widgetResource.name,
      widgetResource.uri,
      {
        description: widgetResource.description,
        mimeType: widgetResource.mimeType,
      },
      async () => {
        const templateHTML = await loadHtml(this.env.ASSETS, "/widget.html");
        return {
          contents: [{
            uri: widgetResource.uri,
            mimeType: UI_MIME_TYPE,
            text: templateHTML,
            _meta: widgetResource._meta as Record<string, unknown>,
          }],
        };
      }
    );

    logger.info({
      event: 'ui_resource_registered',
      uri: widgetResource.uri,
      name: widgetResource.name,
    });

    // PART 2a: Register map_team (model-visible, linked to UI)
    this.server.registerTool(
      "map_team",
      {
        title: TOOL_METADATA["map_team"].title,
        description: getToolDescription("map_team"),
        inputSchema: MapTeamInput,
        outputSchema: MapTeamOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        _meta: {
          ui: {
            resourceUri: widgetResource.uri,
          },
        },
      },
      async (args) => {
        const params = args as MapTeamParams;

        try {
          const result = computeTeamGraph(params);

          logger.info({
            event: 'tool_completed',
            tool: 'map_team',
            user_id: this.props?.userId ?? '',
            user_email: this.props?.email ?? '',
            action_id: '',
            duration_ms: 0,
          });

          const nextSteps = result.insights.busFactorRisks.length > 0
            ? `Click on red skill nodes in the graph to see detailed coverage. ${result.insights.recommendations[0]}`
            : "Explore skill clusters by clicking on nodes. Your team has good coverage!";

          return {
            content: [{
              type: "text" as const,
              text: `${result.summary}\n\nNext steps: ${nextSteps}`,
            }],
            structuredContent: result as unknown as Record<string, unknown>,
            _meta: {
              viewUUID: crypto.randomUUID(),
            },
          };
        } catch (error) {
          logger.error({
            event: 'tool_failed',
            tool: 'map_team',
            error: error instanceof Error ? error.message : String(error),
          });

          return {
            content: [{
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            }],
            isError: true,
          };
        }
      }
    );

    // PART 2b: Register analyze_skill (app-only, hidden from model)
    this.server.registerTool(
      "analyze_skill",
      {
        title: TOOL_METADATA["analyze_skill"].title,
        description: getToolDescription("analyze_skill"),
        inputSchema: AnalyzeSkillInput,
        outputSchema: AnalyzeSkillOutputSchema,
        _meta: {
          ui: {
            visibility: ["app"],
          },
        },
      },
      async (args) => {
        const params = args as AnalyzeSkillParams;

        try {
          const result = analyzeSkill(params);

          logger.info({
            event: 'tool_completed',
            tool: 'analyze_skill',
            user_id: this.props?.userId ?? '',
            user_email: this.props?.email ?? '',
            action_id: '',
            duration_ms: 0,
          });

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify(result),
            }],
            structuredContent: result as unknown as Record<string, unknown>,
          };
        } catch (error) {
          logger.error({
            event: 'tool_failed',
            tool: 'analyze_skill',
            error: error instanceof Error ? error.message : String(error),
          });

          return {
            content: [{
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            }],
            isError: true,
          };
        }
      }
    );

    // Register prompts
    this.server.registerPrompt("analyze-team-skills", {
      title: "Analyze Team Skills",
      description: "Create an interactive skill map for your team. Describe your team members and their competencies to visualize knowledge dependencies, bus factor risks, and skill clusters.",
      argsSchema: {
        team_description: z.string().optional()
          .meta({ description: "Free-text description of team members and their skills. If not provided, I'll ask you interactively." }),
      },
    }, async (params) => {
      const description = (params as { team_description?: string }).team_description;
      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: description
              ? `Analyze this team and create a skill map:\n\n${description}`
              : "I'd like to create a skill map for my team. Please ask me about my team members, their roles, and their skills.",
          },
        }],
      };
    });

    this.server.registerPrompt("check-bus-factor", {
      title: "Check Bus Factor",
      description: "Quickly identify which critical skills in your team are held by only one person. Highlights the biggest knowledge risks.",
      argsSchema: {
        team_description: z.string().optional()
          .meta({ description: "Free-text team description." }),
      },
    }, async (params) => {
      const description = (params as { team_description?: string }).team_description;
      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: description
              ? `Check the bus factor for this team and highlight the biggest risks:\n\n${description}`
              : "I need to check the bus factor for my team. What skills are at risk if someone leaves? Please ask me about my team.",
          },
        }],
      };
    });

    logger.info({ event: 'server_started', auth_mode: 'dual' });
  }
}

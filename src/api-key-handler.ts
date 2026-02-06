/**
 * API Key Authentication Handler for Team Skill Map MCP Server
 *
 * Provides API key authentication for MCP clients that don't support OAuth.
 * Uses custom JSON-RPC handling (NOT SDK transport), so it's safe from
 * the GHSA-345p-7cg4-v4c7 vulnerability.
 */

import { validateApiKey } from "./auth/apiKeys";
import type { Env } from "./types";
import { TOOL_METADATA, getToolDescription } from "./tools/descriptions";
import { computeTeamGraph, type MapTeamParams } from "./tools/map-team";
import { analyzeSkill, type AnalyzeSkillParams } from "./tools/analyze-skill";
import { logger } from "./shared/logger";
import { UI_RESOURCES, UI_MIME_TYPE } from "./resources/ui-resources";
import { loadHtml } from "./helpers/assets";
import { SERVER_INSTRUCTIONS } from "./server-instructions";

const SERVER_NAME = "team-skillmap";
const SERVER_VERSION = "1.0.0";

// ============================================================================
// Main Entry Point
// ============================================================================

export async function handleApiKeyRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string
): Promise<Response> {
  try {
    const authHeader = request.headers.get("Authorization");
    const apiKey = authHeader?.replace("Bearer ", "");

    if (!apiKey) {
      return jsonError("Missing Authorization header", 401);
    }

    const validationResult = await validateApiKey(apiKey, env);
    if (!validationResult) {
      logger.warn({
        event: 'auth_attempt',
        method: 'api_key',
        success: false,
        reason: 'Invalid or expired API key',
      });
      return jsonError("Invalid or expired API key", 401);
    }

    const { userId, email } = validationResult;
    logger.info({
      event: 'auth_attempt',
      method: 'api_key',
      user_email: email,
      user_id: userId,
      success: true,
    });

    if (pathname === "/mcp") {
      return await handleHTTPTransport(request, env, userId, email);
    } else {
      return jsonError("Invalid endpoint. Use /mcp", 400);
    }
  } catch (error) {
    logger.error({
      event: 'server_error',
      error: error instanceof Error ? error.message : String(error),
      context: 'API key handler',
    });
    return jsonError(`Internal server error: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
}

// ============================================================================
// HTTP Transport Handler (JSON-RPC over HTTP)
// ============================================================================

async function handleHTTPTransport(
  request: Request,
  env: Env,
  userId: string,
  userEmail: string
): Promise<Response> {
  try {
    const jsonRpcRequest = await request.json() as {
      jsonrpc: string;
      id: number | string;
      method: string;
      params?: unknown;
    };

    if (jsonRpcRequest.jsonrpc !== "2.0") {
      return jsonRpcResponse(jsonRpcRequest.id, null, { code: -32600, message: "Invalid Request" });
    }

    switch (jsonRpcRequest.method) {
      case "initialize":
        return handleInitialize(jsonRpcRequest);
      case "ping":
        return handlePing(jsonRpcRequest);
      case "tools/list":
        return handleToolsList(jsonRpcRequest);
      case "tools/call":
        return await handleToolsCall(jsonRpcRequest, env, userId, userEmail);
      case "resources/list":
        return handleResourcesList(jsonRpcRequest);
      case "resources/read":
        return await handleResourcesRead(jsonRpcRequest, env);
      case "prompts/list":
        return handlePromptsList(jsonRpcRequest);
      default:
        return jsonRpcResponse(jsonRpcRequest.id, null, { code: -32601, message: `Method not found: ${jsonRpcRequest.method}` });
    }
  } catch (error) {
    return jsonRpcResponse("error", null, { code: -32700, message: `Parse error: ${error instanceof Error ? error.message : String(error)}` });
  }
}

// ============================================================================
// JSON-RPC Method Handlers
// ============================================================================

function handleInitialize(request: { id: number | string }): Response {
  return jsonRpcResponse(request.id, {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {},
      prompts: { listChanged: true },
      resources: { listChanged: true }
    },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
  });
}

function handlePing(request: { id: number | string }): Response {
  return jsonRpcResponse(request.id, {});
}

function handleToolsList(request: { id: number | string }): Response {
  return jsonRpcResponse(request.id, {
    tools: [
      {
        name: "map_team",
        title: TOOL_METADATA["map_team"].title,
        description: getToolDescription("map_team"),
        inputSchema: {
          type: "object",
          properties: {
            members: {
              type: "array",
              description: "Team members with their roles and skills.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  role: { type: "string" },
                  skills: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        level: { type: "string", enum: ["beginner", "intermediate", "expert"] }
                      },
                      required: ["name", "level"]
                    }
                  }
                },
                required: ["name", "role", "skills"]
              }
            }
          },
          required: ["members"]
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
      },
      {
        name: "analyze_skill",
        title: TOOL_METADATA["analyze_skill"].title,
        description: getToolDescription("analyze_skill"),
        inputSchema: {
          type: "object",
          properties: {
            skillName: { type: "string", description: "Name of the skill to analyze" },
            members: {
              type: "array",
              description: "Full team data for analysis context",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  role: { type: "string" },
                  skills: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        level: { type: "string", enum: ["beginner", "intermediate", "expert"] }
                      }
                    }
                  }
                }
              }
            }
          },
          required: ["skillName", "members"]
        }
      }
    ]
  });
}

async function handleToolsCall(
  request: { id: number | string; params?: unknown },
  env: Env,
  userId: string,
  userEmail: string
): Promise<Response> {
  const params = request.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
  const { name, arguments: args } = params || {};

  switch (name) {
    case "map_team": {
      try {
        const mapParams = args as unknown as MapTeamParams;
        const result = computeTeamGraph(mapParams);

        logger.info({
          event: 'tool_completed',
          tool: 'map_team',
          user_id: userId,
          user_email: userEmail,
          action_id: '',
          duration_ms: 0,
        });

        return jsonRpcResponse(request.id, {
          content: [{
            type: "text",
            text: result.summary
          }],
          structuredContent: result
        });
      } catch (error) {
        return jsonRpcResponse(request.id, {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        });
      }
    }

    case "analyze_skill": {
      try {
        const skillParams = args as unknown as AnalyzeSkillParams;
        const result = analyzeSkill(skillParams);

        logger.info({
          event: 'tool_completed',
          tool: 'analyze_skill',
          user_id: userId,
          user_email: userEmail,
          action_id: '',
          duration_ms: 0,
        });

        return jsonRpcResponse(request.id, {
          content: [{
            type: "text",
            text: JSON.stringify(result)
          }],
          structuredContent: result
        });
      } catch (error) {
        return jsonRpcResponse(request.id, {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        });
      }
    }

    default:
      return jsonRpcResponse(request.id, null, { code: -32602, message: `Unknown tool: ${name}` });
  }
}

function handleResourcesList(request: { id: number | string }): Response {
  return jsonRpcResponse(request.id, {
    resources: [{
      uri: UI_RESOURCES.widget.uri,
      name: UI_RESOURCES.widget.name,
      description: UI_RESOURCES.widget.description,
      mimeType: UI_RESOURCES.widget.mimeType
    }]
  });
}

async function handleResourcesRead(
  request: { id: number | string; params?: unknown },
  env: Env
): Promise<Response> {
  const params = request.params as { uri?: string } | undefined;
  const { uri } = params || {};

  if (uri === UI_RESOURCES.widget.uri) {
    const html = await loadHtml(env.ASSETS, "/widget.html");
    return jsonRpcResponse(request.id, {
      contents: [{
        uri: UI_RESOURCES.widget.uri,
        mimeType: UI_MIME_TYPE,
        text: html,
        _meta: UI_RESOURCES.widget._meta
      }]
    });
  }

  return jsonRpcResponse(request.id, null, { code: -32602, message: `Unknown resource: ${uri}` });
}

function handlePromptsList(request: { id: number | string }): Response {
  return jsonRpcResponse(request.id, {
    prompts: [
      {
        name: "analyze-team-skills",
        title: "Analyze Team Skills",
        description: "Create an interactive skill map for your team."
      },
      {
        name: "check-bus-factor",
        title: "Check Bus Factor",
        description: "Identify which critical skills are held by only one person."
      }
    ]
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function jsonRpcResponse(id: number | string, result: unknown, error?: { code: number; message: string }): Response {
  const response: Record<string, unknown> = { jsonrpc: "2.0", id };
  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }
  return new Response(JSON.stringify(response), {
    headers: { "Content-Type": "application/json" }
  });
}

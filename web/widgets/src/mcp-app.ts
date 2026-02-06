/**
 * Team Skill Map - Force-directed graph visualization of team competencies
 *
 * Follows wiki-explorer pattern: Vanilla TS + force-graph + MCP Apps SDK
 */
import { App, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
} from "d3-force-3d";
import ForceGraph, { type LinkObject, type NodeObject } from "force-graph";
import "./mcp-app.css";

// =============================================================================
// Types
// =============================================================================

function getCSSColor(varName: string): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim() || "#000"
  );
}

interface GraphNode extends NodeObject {
  id: string;
  label: string;
  type: "person" | "skill";
  role?: string;
  holderCount?: number;
  riskLevel?: "critical" | "low" | "adequate" | "strong";
}

interface GraphLink extends LinkObject {
  source: string | GraphNode;
  target: string | GraphNode;
  weight: number;
  level: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface TeamInsights {
  totalMembers: number;
  totalSkills: number;
  busFactorRisks: Array<{
    skill: string;
    holders: string[];
    severity: "critical" | "high" | "medium";
  }>;
  clusters: Array<{
    name: string;
    members: string[];
    skills: string[];
  }>;
  recommendations: string[];
}

interface TeamMember {
  name: string;
  role: string;
  skills: Array<{
    name: string;
    level: "beginner" | "intermediate" | "expert";
  }>;
}

interface MapTeamResponse {
  nodes: GraphNode[];
  links: GraphLink[];
  insights: TeamInsights;
  summary: string;
  teamData: TeamMember[];
}

interface AnalyzeSkillResponse {
  skill: string;
  holders: Array<{
    name: string;
    role: string;
    level: string;
  }>;
  busFactorScore: number;
  coverageLevel: string;
  recommendation: string;
}

// =============================================================================
// State
// =============================================================================

const graphData: GraphData = { nodes: [], links: [] };
let selectedNode: GraphNode | null = null;
let highlightedNodes = new Set<string>();
let teamData: TeamMember[] = [];
let currentInsights: TeamInsights | null = null;

// =============================================================================
// DOM References
// =============================================================================

const container = document.getElementById("graph")!;
const insightsBar = document.getElementById("insights")!;
const popup = document.getElementById("popup")!;
const popupTitle = popup.querySelector(".popup-title")!;
const popupDetail = popup.querySelector(".popup-detail")! as HTMLElement;
const popupError = popup.querySelector(".popup-error")! as HTMLElement;
const popupActions = popup.querySelector(".popup-actions")! as HTMLElement;
const highlightBtn = document.getElementById("highlight-btn")!;
const analyzeBtn = document.getElementById("analyze-btn")!;
const zoomInBtn = document.getElementById("zoom-in")!;
const zoomOutBtn = document.getElementById("zoom-out")!;
const resetBtn = document.getElementById("reset-graph")!;
const closeBtn = popup.querySelector(".popup-close")! as HTMLElement;

// Show empty state initially
insightsBar.innerHTML = '<div class="empty-state">Waiting for team data...</div>';

// =============================================================================
// Force-Graph Initialization
// =============================================================================

const graph = new ForceGraph<GraphNode, GraphLink>(container)
  .nodeId("id")
  .nodeLabel((node: GraphNode) => {
    if (node.type === "person") return `${node.label} (${node.role})`;
    return `${node.label} - ${node.holderCount} holder${node.holderCount !== 1 ? "s" : ""}`;
  })
  .nodeColor((node: GraphNode) => {
    if (highlightedNodes.size > 0 && !highlightedNodes.has(node.id)) {
      return getCSSColor("--link-color"); // Dim non-highlighted
    }
    if (node.type === "person") return getCSSColor("--node-person");
    switch (node.riskLevel) {
      case "critical": return getCSSColor("--node-critical");
      case "low": return getCSSColor("--node-low");
      default: return getCSSColor("--node-safe");
    }
  })
  .nodeVal((node: GraphNode) => node.type === "person" ? 12 : 6)
  .linkWidth((link: GraphLink) => {
    const w = typeof link.weight === "number" ? link.weight : 1;
    return w;
  })
  .linkColor(() => getCSSColor("--link-color"))
  .linkDirectionalArrowLength(6)
  .linkDirectionalArrowRelPos(1)
  .onNodeClick(handleNodeClick as any)
  .onBackgroundClick(() => hidePopup())
  .d3Force("charge", forceManyBody().strength(-120))
  .d3Force("link", forceLink().distance(80))
  .d3Force("collide", forceCollide(15))
  .d3Force("center", forceCenter())
  .d3VelocityDecay(0.3)
  .cooldownTime(Infinity)
  .d3AlphaMin(0)
  .graphData(graphData);

// Resize handler
function handleResize() {
  const { width } = container.getBoundingClientRect();
  graph.width(width).height(500);
}
window.addEventListener("resize", handleResize);
handleResize();

// =============================================================================
// Graph Data Management
// =============================================================================

function populateGraph(response: MapTeamResponse): void {
  graphData.nodes = [];
  graphData.links = [];

  for (const node of response.nodes) {
    graphData.nodes.push({ ...node });
  }

  for (const link of response.links) {
    graphData.links.push({ ...link });
  }

  teamData = response.teamData;
  currentInsights = response.insights;

  graph.graphData({ nodes: [...graphData.nodes], links: [...graphData.links] });

  // Center graph after a short delay
  setTimeout(() => {
    graph.zoomToFit(400, 40);
  }, 500);

  updateInsightsBar();
}

function updateInsightsBar(): void {
  if (!currentInsights) return;

  const { totalMembers, totalSkills, busFactorRisks, recommendations } = currentInsights;
  const criticalCount = busFactorRisks.filter((r) => r.severity === "critical").length;
  const highCount = busFactorRisks.filter((r) => r.severity === "high").length;

  let html = "";

  // Summary badge
  html += `<span class="insight-badge safe">${totalMembers} people &middot; ${totalSkills} skills</span>`;

  // Risk badges
  if (criticalCount > 0) {
    html += `<span class="insight-badge critical">${criticalCount} critical risk${criticalCount > 1 ? "s" : ""}</span>`;
  }
  if (highCount > 0) {
    html += `<span class="insight-badge warning">${highCount} high risk${highCount > 1 ? "s" : ""}</span>`;
  }
  if (criticalCount === 0 && highCount === 0) {
    html += `<span class="insight-badge safe">No risks</span>`;
  }

  // Recommendation
  if (recommendations.length > 0) {
    html += `<span class="insight-recommendation">${recommendations[0]}</span>`;
  }

  insightsBar.innerHTML = html;
}

// =============================================================================
// Popup Management
// =============================================================================

function showPopup(node: GraphNode, x: number, y: number): void {
  selectedNode = node;
  highlightedNodes.clear();
  popupError.style.display = "none";

  if (node.type === "person") {
    popupTitle.textContent = node.label;
    const skillCount = graphData.links.filter((l) => {
      const src = typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
      return src === node.id;
    }).length;
    popupDetail.textContent = `Role: ${node.role} | ${skillCount} skill${skillCount !== 1 ? "s" : ""}`;
    highlightBtn.style.display = "inline-block";
    analyzeBtn.style.display = "none";
  } else {
    popupTitle.textContent = node.label;
    const holdersText = node.holderCount === 1
      ? "1 holder - CRITICAL"
      : `${node.holderCount} holders`;
    popupDetail.textContent = `${holdersText} | Risk: ${node.riskLevel}`;
    highlightBtn.style.display = "none";
    analyzeBtn.style.display = "inline-block";
    analyzeBtn.removeAttribute("disabled");
    analyzeBtn.textContent = "Analyze";
  }

  popup.style.display = "block";
  const rect = popup.getBoundingClientRect();
  const gap = 15;

  const left = x < window.innerWidth / 2
    ? x + gap
    : x - rect.width - gap;
  const top = y < window.innerHeight / 2
    ? y + gap
    : y - rect.height - gap;

  popup.style.left = `${Math.max(4, left)}px`;
  popup.style.top = `${Math.max(4, top)}px`;
}

function hidePopup(): void {
  popup.style.display = "none";
  selectedNode = null;
  highlightedNodes.clear();
  graph.nodeColor(graph.nodeColor()); // Refresh colors
}

// =============================================================================
// Event Handlers
// =============================================================================

function handleNodeClick(node: GraphNode, event: MouseEvent): void {
  if (selectedNode?.id === node.id) {
    hidePopup();
    return;
  }
  showPopup(node, event.clientX, event.clientY);
}

closeBtn.addEventListener("click", () => hidePopup());

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && popup.style.display === "block") {
    hidePopup();
  }
});

// Highlight connected nodes for person
highlightBtn.addEventListener("click", () => {
  if (!selectedNode || selectedNode.type !== "person") return;

  highlightedNodes.clear();
  highlightedNodes.add(selectedNode.id);

  for (const link of graphData.links) {
    const src = typeof link.source === "string" ? link.source : (link.source as GraphNode).id;
    const tgt = typeof link.target === "string" ? link.target : (link.target as GraphNode).id;
    if (src === selectedNode.id) {
      highlightedNodes.add(tgt);
    }
  }

  graph.nodeColor(graph.nodeColor()); // Refresh
  hidePopup();
});

// Zoom controls
const ZOOM_FACTOR = 1.5;
zoomInBtn.addEventListener("click", () => {
  graph.zoom(graph.zoom() * ZOOM_FACTOR, 200);
});
zoomOutBtn.addEventListener("click", () => {
  graph.zoom(graph.zoom() / ZOOM_FACTOR, 200);
});
resetBtn.addEventListener("click", () => {
  highlightedNodes.clear();
  graph.nodeColor(graph.nodeColor());
  graph.zoomToFit(400, 40);
});

// =============================================================================
// MCP Apps SDK Integration
// =============================================================================

const app = new App(
  { name: "Team Skill Map", version: "1.0.0" },
  {},
  { autoResize: false }
);

// Handle tool input - show loading state
app.ontoolinput = (_params) => {
  insightsBar.innerHTML = '<div class="empty-state">Processing team data...</div>';
};

// Handle tool result - populate graph
app.ontoolresult = (result) => {
  if (result.isError) {
    insightsBar.innerHTML = '<div class="empty-state">Error loading team data</div>';
    console.error("Tool result error:", result);
    return;
  }

  const response = result.structuredContent as unknown as MapTeamResponse;
  if (response?.nodes && response?.links) {
    graph.warmupTicks(100);
    populateGraph(response);
  }
};

// Analyze skill - called by widget when user clicks skill node
analyzeBtn.addEventListener("click", async () => {
  if (!selectedNode || selectedNode.type !== "skill") return;

  const skillName = selectedNode.label;
  analyzeBtn.setAttribute("disabled", "true");
  analyzeBtn.textContent = "Loading...";
  popupError.style.display = "none";

  try {
    const result: CallToolResult = await app.callServerTool({
      name: "analyze_skill",
      arguments: {
        skillName,
        members: teamData,
      },
    });

    if (result.isError) {
      popupError.textContent = "Failed to analyze skill";
      popupError.style.display = "block";
    } else {
      const analysis = result.structuredContent as unknown as AnalyzeSkillResponse;
      popupDetail.innerHTML = `
        <strong>Bus Factor Score:</strong> ${analysis.busFactorScore}/100 (${analysis.coverageLevel})<br>
        <strong>Holders:</strong> ${analysis.holders.map((h) => `${h.name} (${h.level})`).join(", ")}<br>
        <strong>Recommendation:</strong> ${analysis.recommendation}
      `;
    }
  } catch (e) {
    console.error("Analyze error:", e);
    popupError.textContent = "Request failed";
    popupError.style.display = "block";
  } finally {
    analyzeBtn.removeAttribute("disabled");
    analyzeBtn.textContent = "Analyze";
  }
});

// Error handler
app.onerror = (err) => {
  console.error("[Team Skill Map] App error:", err);
};

// Theme support
function handleHostContextChanged(ctx: McpUiHostContext) {
  if (ctx.theme) {
    document.documentElement.classList.toggle("dark", ctx.theme === "dark");
    // Refresh graph colors after theme change
    graph.nodeColor(graph.nodeColor());
    graph.linkColor(graph.linkColor());
  }
  if (ctx.safeAreaInsets) {
    document.body.style.paddingTop = `${ctx.safeAreaInsets.top}px`;
    document.body.style.paddingRight = `${ctx.safeAreaInsets.right}px`;
    document.body.style.paddingBottom = `${ctx.safeAreaInsets.bottom}px`;
    document.body.style.paddingLeft = `${ctx.safeAreaInsets.left}px`;
  }
}

app.onhostcontextchanged = handleHostContextChanged;

// Teardown
app.onteardown = async () => {
  window.removeEventListener("resize", handleResize);
  return {};
};

// Connect LAST
app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) {
    handleHostContextChanged(ctx);
  }
});

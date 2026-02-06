import * as z from "zod/v4";

// --- Zod 4 Input Schema (plain object for MCP SDK) ---

export const MapTeamInput = {
  members: z.array(
    z.object({
      name: z.string().min(1),
      role: z.string().min(1),
      skills: z.array(
        z.object({
          name: z.string().min(1),
          level: z.enum(["beginner", "intermediate", "expert"]),
        })
      ).min(1),
    })
  ).min(1).meta({ description: "Team members with their roles and skills. Each member must have at least one skill." }),
};

export interface MapTeamParams {
  members: Array<{
    name: string;
    role: string;
    skills: Array<{
      name: string;
      level: "beginner" | "intermediate" | "expert";
    }>;
  }>;
}

// --- Output Types ---

export interface GraphNode {
  id: string;
  label: string;
  type: "person" | "skill";
  role?: string;
  holderCount?: number;
  riskLevel?: "critical" | "low" | "adequate" | "strong";
}

export interface GraphLink {
  source: string;
  target: string;
  weight: number;
  level: string;
}

export interface BusFactorRisk {
  skill: string;
  holders: string[];
  severity: "critical" | "high" | "medium";
}

export interface SkillCluster {
  name: string;
  members: string[];
  skills: string[];
}

export interface TeamInsights {
  totalMembers: number;
  totalSkills: number;
  busFactorRisks: BusFactorRisk[];
  clusters: SkillCluster[];
  recommendations: string[];
}

export interface MapTeamOutput {
  nodes: GraphNode[];
  links: GraphLink[];
  insights: TeamInsights;
  summary: string;
  teamData: MapTeamParams["members"];
}

// --- Level weight mapping ---

const LEVEL_WEIGHT: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  expert: 3,
};

// --- Main computation ---

export function computeTeamGraph(params: MapTeamParams): MapTeamOutput {
  const { members } = params;

  // Collect all unique skills and their holders
  const skillHolders = new Map<string, Array<{ name: string; role: string; level: string }>>();

  for (const member of members) {
    for (const skill of member.skills) {
      const holders = skillHolders.get(skill.name) ?? [];
      holders.push({ name: member.name, role: member.role, level: skill.level });
      skillHolders.set(skill.name, holders);
    }
  }

  // Build person nodes
  const nodes: GraphNode[] = members.map((m) => ({
    id: `person:${m.name}`,
    label: m.name,
    type: "person" as const,
    role: m.role,
  }));

  // Build skill nodes with risk levels
  for (const [skillName, holders] of skillHolders) {
    const count = holders.length;
    let riskLevel: GraphNode["riskLevel"];
    if (count === 1) riskLevel = "critical";
    else if (count === 2) riskLevel = "low";
    else if (count === 3) riskLevel = "adequate";
    else riskLevel = "strong";

    nodes.push({
      id: `skill:${skillName}`,
      label: skillName,
      type: "skill",
      holderCount: count,
      riskLevel,
    });
  }

  // Build links
  const links: GraphLink[] = [];
  for (const member of members) {
    for (const skill of member.skills) {
      links.push({
        source: `person:${member.name}`,
        target: `skill:${skill.name}`,
        weight: LEVEL_WEIGHT[skill.level] ?? 1,
        level: skill.level,
      });
    }
  }

  // Compute bus factor risks
  const busFactorRisks: BusFactorRisk[] = [];
  for (const [skillName, holders] of skillHolders) {
    if (holders.length === 1) {
      busFactorRisks.push({
        skill: skillName,
        holders: holders.map((h) => h.name),
        severity: "critical",
      });
    } else if (holders.length === 2) {
      busFactorRisks.push({
        skill: skillName,
        holders: holders.map((h) => h.name),
        severity: "high",
      });
    }
  }

  // Sort risks: critical first, then high
  busFactorRisks.sort((a, b) => {
    if (a.severity === "critical" && b.severity !== "critical") return -1;
    if (a.severity !== "critical" && b.severity === "critical") return 1;
    return 0;
  });

  // Detect clusters: groups of people who share 2+ skills
  const clusters = detectClusters(members);

  // Generate recommendations
  const recommendations = generateRecommendations(busFactorRisks, members, skillHolders);

  const criticalCount = busFactorRisks.filter((r) => r.severity === "critical").length;
  const summary = `Team of ${members.length} members mapped with ${skillHolders.size} skills. ${criticalCount} skills at critical risk (bus factor 1).${
    criticalCount > 0
      ? ` Top risk: ${busFactorRisks[0].skill} (only held by ${busFactorRisks[0].holders[0]}).`
      : ""
  }`;

  return {
    nodes,
    links,
    insights: {
      totalMembers: members.length,
      totalSkills: skillHolders.size,
      busFactorRisks,
      clusters,
      recommendations,
    },
    summary,
    teamData: members,
  };
}

function detectClusters(members: MapTeamParams["members"]): SkillCluster[] {
  const clusters: SkillCluster[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const skillsA = new Set(members[i].skills.map((s) => s.name));
      const skillsB = new Set(members[j].skills.map((s) => s.name));
      const shared = [...skillsA].filter((s) => skillsB.has(s));

      if (shared.length >= 2) {
        const key = [members[i].name, members[j].name].sort().join("|");
        if (!processed.has(key)) {
          processed.add(key);
          clusters.push({
            name: `${shared.slice(0, 2).join(" & ")} cluster`,
            members: [members[i].name, members[j].name],
            skills: shared,
          });
        }
      }
    }
  }

  return clusters;
}

function generateRecommendations(
  risks: BusFactorRisk[],
  members: MapTeamParams["members"],
  skillHolders: Map<string, Array<{ name: string; role: string; level: string }>>
): string[] {
  const recommendations: string[] = [];

  const criticalRisks = risks.filter((r) => r.severity === "critical");
  if (criticalRisks.length > 0) {
    const topRisk = criticalRisks[0];
    recommendations.push(
      `CRITICAL: "${topRisk.skill}" is only held by ${topRisk.holders[0]}. Cross-train at least one more team member immediately.`
    );
  }

  if (criticalRisks.length > 3) {
    recommendations.push(
      `${criticalRisks.length} skills have bus factor 1. Consider a structured cross-training program.`
    );
  }

  // Find overloaded members (many unique skills)
  const memberSkillCounts = members.map((m) => ({
    name: m.name,
    uniqueSkills: m.skills.filter(
      (s) => (skillHolders.get(s.name)?.length ?? 0) === 1
    ).length,
  }));
  const overloaded = memberSkillCounts.filter((m) => m.uniqueSkills >= 3);
  for (const m of overloaded) {
    recommendations.push(
      `${m.name} holds ${m.uniqueSkills} unique skills. This person is a key-person risk.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("Good coverage! No critical single-point-of-failure risks detected.");
  }

  return recommendations.slice(0, 3);
}

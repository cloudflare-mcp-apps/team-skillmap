import * as z from "zod/v4";
import type { MapTeamParams } from "./map-team";

// --- Zod 4 Input Schema (plain object for MCP SDK) ---

export const AnalyzeSkillInput = {
  skillName: z.string().min(1).meta({ description: "Name of the skill to analyze" }),
  members: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      skills: z.array(
        z.object({
          name: z.string(),
          level: z.enum(["beginner", "intermediate", "expert"]),
        })
      ),
    })
  ).meta({ description: "Full team data for analysis context" }),
};

export interface AnalyzeSkillParams {
  skillName: string;
  members: MapTeamParams["members"];
}

// --- Output Types ---

export interface AnalyzeSkillOutput {
  skill: string;
  holders: Array<{
    name: string;
    role: string;
    level: "beginner" | "intermediate" | "expert";
  }>;
  busFactorScore: number;
  coverageLevel: "critical" | "low" | "adequate" | "strong";
  recommendation: string;
}

// --- Main computation ---

export function analyzeSkill(params: AnalyzeSkillParams): AnalyzeSkillOutput {
  const { skillName, members } = params;

  // Find all holders of this skill
  const holders: AnalyzeSkillOutput["holders"] = [];
  for (const member of members) {
    const skill = member.skills.find((s) => s.name === skillName);
    if (skill) {
      holders.push({
        name: member.name,
        role: member.role,
        level: skill.level,
      });
    }
  }

  // Compute bus factor score: min(100, holders.length * 33)
  const busFactorScore = Math.min(100, holders.length * 33);

  // Determine coverage level
  let coverageLevel: AnalyzeSkillOutput["coverageLevel"];
  if (holders.length <= 1) coverageLevel = "critical";
  else if (holders.length === 2) coverageLevel = "low";
  else if (holders.length === 3) coverageLevel = "adequate";
  else coverageLevel = "strong";

  // Generate recommendation
  const recommendation = generateSkillRecommendation(skillName, holders, coverageLevel);

  return {
    skill: skillName,
    holders,
    busFactorScore,
    coverageLevel,
    recommendation,
  };
}

function generateSkillRecommendation(
  skillName: string,
  holders: AnalyzeSkillOutput["holders"],
  coverageLevel: AnalyzeSkillOutput["coverageLevel"]
): string {
  if (holders.length === 0) {
    return `No one on the team currently holds "${skillName}". Consider hiring or training for this skill.`;
  }

  if (coverageLevel === "critical") {
    const holder = holders[0];
    return `"${skillName}" is held by only ${holder.name} (${holder.role}). Cross-train at least one more team member to reduce single-point-of-failure risk.`;
  }

  if (coverageLevel === "low") {
    const names = holders.map((h) => h.name).join(" and ");
    return `"${skillName}" is covered by ${names}. Consider training a third person for better resilience.`;
  }

  if (coverageLevel === "adequate") {
    return `"${skillName}" has adequate coverage with ${holders.length} holders. Monitor for any team changes.`;
  }

  return `"${skillName}" is well-covered by ${holders.length} team members. No action needed.`;
}

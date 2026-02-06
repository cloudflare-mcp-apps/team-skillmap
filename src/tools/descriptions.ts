export interface ToolMetadata {
  title: string;
  description: {
    part1_purpose: string;
    part2_returns: string;
    part3_useCase: string;
    part4_constraints: string;
  };
  examples: {
    scenario: string;
    description: string;
  }[];
}

export const TOOL_METADATA = {
  "map_team": {
    title: "Map Team Skills",
    description: {
      part1_purpose: "Visualize team competencies as an interactive force-directed graph showing people, skills, and risk dependencies.",
      part2_returns: "Returns graph nodes (people + skills), edges with proficiency weights, bus factor analysis, and cluster insights.",
      part3_useCase: "Use when user describes their team structure, skills, or wants to identify knowledge bottlenecks.",
      part4_constraints: "Works best with 3-50 team members. Skill names are case-sensitive. Each member must have at least one skill."
    },
    examples: [
      {
        scenario: "Small team mapping",
        description: "Map a 5-person development team to identify skill coverage gaps"
      },
      {
        scenario: "Bus factor analysis",
        description: "Identify which critical skills are held by only one team member"
      }
    ]
  } as const satisfies ToolMetadata,

  "analyze_skill": {
    title: "Analyze Skill",
    description: {
      part1_purpose: "Return detailed analysis for a specific skill node including holders, proficiency levels, and coverage assessment.",
      part2_returns: "Returns holders with proficiency levels, bus factor score (0-100), coverage level, and actionable recommendation.",
      part3_useCase: "Called by widget when user clicks a skill node to see detailed breakdown.",
      part4_constraints: "Requires the full team data context to be passed along with the skill name."
    },
    examples: [
      {
        scenario: "Critical skill analysis",
        description: "Analyze a skill held by only one person to get cross-training recommendations"
      }
    ]
  } as const satisfies ToolMetadata,
} as const;

export type ToolName = keyof typeof TOOL_METADATA;

export function getToolDescription(toolName: ToolName): string {
  const meta = TOOL_METADATA[toolName];
  const { part1_purpose, part2_returns, part3_useCase, part4_constraints } = meta.description;
  return `${part1_purpose} ${part2_returns} ${part3_useCase} ${part4_constraints}`;
}

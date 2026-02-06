export const SERVER_INSTRUCTIONS = `
# Team Skill Map MCP Server

## Capabilities
- Visualize team competencies as an interactive force-directed graph
- Identify bus factor risks (skills held by only one person)
- Detect skill clusters and knowledge silos
- Generate actionable recommendations for cross-training

## Tools Overview
- **map_team**: Create a visual skill map from team member descriptions. Returns an interactive graph showing people (blue nodes), skills (colored by risk), and proficiency links.

## Usage Guidelines
- Gather team data through conversation before calling map_team
- Each member needs: name, role, and at least one skill with proficiency level
- Skill levels: beginner, intermediate, expert
- The tool works best with 3-50 team members
- Use consistent skill names (e.g., "TypeScript" not "TS" and "TypeScript" mixed)

## Data Format
When calling map_team, structure the data as:
- members: array of { name, role, skills: [{ name, level }] }

## Example Interaction
User: "I have a team of 5 developers..."
-> Parse the description into structured members array
-> Call map_team with the structured data
-> The interactive graph will appear showing skill dependencies

## Constraints
- No persistent storage - team data exists only for the current conversation
- Maximum recommended team size: 50 members (graph becomes cluttered beyond that)
- Skill names are case-sensitive - normalize them before calling the tool
`.trim();

export default SERVER_INSTRUCTIONS;

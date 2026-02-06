# Team Skill Map MCP

Force-directed graph visualization of team competencies with bus factor analysis, skill clustering, and interactive node exploration.

## Features

- **Interactive Graph** - Force-directed visualization with person and skill nodes
- **Bus Factor Analysis** - Identifies critical skills held by only one person
- **Skill Clustering** - Groups related competencies and team members
- **Risk Scoring** - Color-coded nodes (critical/low/adequate/strong)
- **Drill-down Analysis** - Click any skill node for detailed coverage data

## Tools

| Tool | Visibility | Description |
|------|-----------|-------------|
| `map_team` | Model + App | Builds skill graph from team member data |
| `analyze_skill` | App only | Deep-dive into a specific skill's coverage |

## Prompts

| Prompt | Description |
|--------|-------------|
| `analyze-team-skills` | Interactive skill map creation workflow |
| `check-bus-factor` | Quick bus factor risk identification |

## Architecture

- **Runtime:** Cloudflare Workers + Durable Objects (McpAgent)
- **Widget:** Vanilla TypeScript + force-graph + d3-force-3d
- **Auth:** Dual - OAuth 2.1 (WorkOS AuthKit) + API Key
- **Protocol:** MCP Apps (SEP-1865) with `ui://` resources

## Development

```bash
npm install --legacy-peer-deps
npm run build:widgets   # Build widget HTML
npm run verify-all      # TypeScript check + widget build
```

## Deployment

Automatic via Cloudflare Workers Builds on push to `main`.

## License

Private - All rights reserved.

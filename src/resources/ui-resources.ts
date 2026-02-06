export const UI_MIME_TYPE = "text/html;profile=mcp-app" as const;

export interface UIResourceMeta {
  ui?: {
    csp?: {
      connectDomains?: string[];
      resourceDomains?: string[];
    };
    domain?: string;
    prefersBorder?: boolean;
  };
}

export interface UIResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: typeof UI_MIME_TYPE;
  _meta: UIResourceMeta;
}

export const UI_RESOURCES = {
  widget: {
    uri: "ui://team-skillmap/widget.html",
    name: "skillmap_widget",
    description:
      "Interactive force-directed graph widget for team competency visualization. " +
      "Shows people and skills as interconnected nodes, color-coded by bus factor risk.",
    mimeType: UI_MIME_TYPE,
    _meta: {
      ui: {
        csp: {
          connectDomains: [] as string[],
          resourceDomains: [] as string[],
        },
        prefersBorder: true,
      },
    },
  },
} as const;

export type UiResourceUri = typeof UI_RESOURCES[keyof typeof UI_RESOURCES]["uri"];

export const UI_EXTENSION_ID = "io.modelcontextprotocol/ui";

export function hasUISupport(clientCapabilities: unknown): boolean {
  if (!clientCapabilities || typeof clientCapabilities !== "object") {
    return false;
  }
  const caps = clientCapabilities as Record<string, unknown>;
  const extensions = caps.extensions as Record<string, unknown> | undefined;
  if (!extensions) return false;
  const uiExtension = extensions[UI_EXTENSION_ID] as Record<string, unknown> | undefined;
  if (!uiExtension) return false;
  const mimeTypes = uiExtension.mimeTypes as string[] | undefined;
  if (!Array.isArray(mimeTypes)) return false;
  return mimeTypes.includes(UI_MIME_TYPE);
}

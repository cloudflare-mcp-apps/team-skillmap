import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { TeamSkillmap } from "./server";
import { AuthkitHandler } from "./auth/authkit-handler";
import { handleApiKeyRequest } from "./api-key-handler";
import type { Env } from "./types";
import { logger } from "./shared/logger";

export { TeamSkillmap };

const oauthProvider = new OAuthProvider({
    apiHandlers: {
        '/mcp': TeamSkillmap.serve('/mcp'),
    },
    defaultHandler: AuthkitHandler as any,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
});

export default {
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext
    ): Promise<Response> {
        try {
            const url = new URL(request.url);
            const authHeader = request.headers.get("Authorization");

            if (isApiKeyRequest(url.pathname, authHeader)) {
                logger.info({ event: 'transport_request', transport: 'http', method: 'api_key', user_email: '' });
                return await handleApiKeyRequest(request, env, ctx, url.pathname);
            }

            logger.info({ event: 'transport_request', transport: 'http', method: 'oauth', user_email: '' });
            return await oauthProvider.fetch(request, env, ctx);

        } catch (error) {
            logger.error({ event: 'server_error', error: String(error), context: 'Dual auth handler' });
            return new Response(
                JSON.stringify({
                    error: "Internal server error",
                    message: error instanceof Error ? error.message : String(error),
                }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }
    },
};

function isApiKeyRequest(pathname: string, authHeader: string | null): boolean {
    if (pathname !== "/mcp") {
        return false;
    }
    if (!authHeader) {
        return false;
    }
    const token = authHeader.replace("Bearer ", "");
    return token.startsWith("wtyk_");
}

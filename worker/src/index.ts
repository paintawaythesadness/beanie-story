import type { Env, StoryNode } from "./types";
import { getNode, listRecentIds, saveNode, writeRecentIds } from "./storage";
import {
  HttpError,
  createCorsHeaders,
  createSessionToken,
  empty,
  getExpiryIso,
  json,
  parseBearerToken,
  readJson,
  sanitizeNode,
  validateNodeId,
  verifySessionToken,
} from "./utils";

interface LoginBody {
  password?: string;
}

interface SaveNodeBody {
  id?: string;
  title?: string;
  status?: string;
  content?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = createCorsHeaders(request, env.ALLOWED_ORIGINS || "http://localhost:5173");

    if (request.method === "OPTIONS") {
      return empty({ status: 204, headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);

      if (request.method === "POST" && url.pathname === "/api/login") {
        const body = await readJson<LoginBody>(request);
        if (!body.password || body.password !== env.EDITOR_PASSWORD) {
          throw new HttpError(401, "Incorrect password.");
        }

        const ttlSeconds = Number.parseInt(env.SESSION_TTL_SECONDS || "604800", 10);
        const token = await createSessionToken(env.AUTH_SECRET, ttlSeconds);

        return json(
          {
            token,
            expiresAt: getExpiryIso(token),
          },
          { headers: corsHeaders },
        );
      }

      if (request.method === "POST" && url.pathname === "/api/logout") {
        await assertAuthorized(request, env);
        return json({ ok: true }, { headers: corsHeaders });
      }

      await assertAuthorized(request, env);

      if (request.method === "GET" && url.pathname === "/api/recent") {
        const ids = await listRecentIds(env);
        const nodes = await Promise.all(ids.map((id) => getNode(env, id)));

        return json(
          {
            nodes: nodes.filter((node): node is StoryNode => Boolean(node)),
          },
          { headers: corsHeaders },
        );
      }

      const nodeMatch = url.pathname.match(/^\/api\/node\/([^/]+)$/);
      if (nodeMatch) {
        const nodeId = validateNodeId(decodeURIComponent(nodeMatch[1]));

        if (request.method === "GET") {
          const existing = await getNode(env, nodeId);
          if (!existing) {
            return json(
              {
                id: nodeId,
                title: "",
                status: "default",
                content: "",
                updatedAt: "",
              },
              { headers: corsHeaders },
            );
          }

          return json(existing, { headers: corsHeaders });
        }

        if (request.method === "PUT") {
          const body = await readJson<SaveNodeBody>(request);
          const node = sanitizeNode({
            id: body.id || nodeId,
            title: body.title,
            status: body.status || "default",
            content: body.content || "",
          });

          if (node.id !== nodeId) {
            throw new HttpError(400, "Node ID in the URL must match the request body.");
          }

          await saveNode(env, node);
          await updateRecentIndex(env, node.id);

          return json(node, { headers: corsHeaders });
        }
      }

      throw new HttpError(404, "Route not found.");
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, { status: error.status, headers: corsHeaders });
      }

      console.error(error);
      return json({ error: "Internal server error." }, { status: 500, headers: corsHeaders });
    }
  },
};

async function assertAuthorized(request: Request, env: Env) {
  const token = parseBearerToken(request);
  if (!token) {
    throw new HttpError(401, "Unauthorized.");
  }

  const isValid = await verifySessionToken(token, env.AUTH_SECRET);
  if (!isValid) {
    throw new HttpError(401, "Unauthorized.");
  }
}

async function updateRecentIndex(env: Env, nodeId: string) {
  const limit = Math.max(1, Number.parseInt(env.RECENT_NODE_LIMIT || "12", 10));
  const current = await listRecentIds(env);
  const next = [nodeId, ...current.filter((id) => id !== nodeId)].slice(0, limit);
  await writeRecentIds(env, next);
}

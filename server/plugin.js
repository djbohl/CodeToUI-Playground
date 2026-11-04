import path from "node:path";
import { createProtoApi } from "./create-api.js";
import { ensureProjectsRoot } from "./projects.js";

const PROJECTS_ROOT = path.resolve(process.cwd(), "projects");
const PROTO_WS_PORT = 5801;

export function protoDevPlugin() {
  return {
    name: "proto-dev-server",
    async configureServer(server) {
      const initialProject = await ensureProjectsRoot(PROJECTS_ROOT);
      const api = createProtoApi({
        projectsRoot: PROJECTS_ROOT,
        wsPort: PROTO_WS_PORT,
        initialProject,
      });
      server.middlewares.use(api.middleware);
      server.httpServer?.once("close", () => api.close());
    },
  };
}

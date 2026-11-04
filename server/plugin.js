import path from "node:path";
import { createProtoApi } from "./create-api.js";

const PROJECT_DIR = path.resolve(process.cwd(), "project");
const PROTO_WS_PORT = 5801;

export function protoDevPlugin() {
  return {
    name: "proto-dev-server",
    configureServer(server) {
      const api = createProtoApi({ projectDir: PROJECT_DIR, wsPort: PROTO_WS_PORT });
      server.middlewares.use(api.middleware);
      server.httpServer?.once("close", () => api.close());
    },
  };
}

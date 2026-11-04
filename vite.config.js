import { defineConfig } from "vite";
import { protoDevPlugin } from "./server/plugin.js";

export default defineConfig({
  plugins: [protoDevPlugin()],
  server: {
    watch: {
      // The "projects" folder (user's screens) is watched separately by our
      // own chokidar instance in server/watcher.js. If Vite's own dev-server
      // watcher also sees these files change, it treats .html changes as a
      // reason to full-page-reload the browser -- which, since we write to
      // disk on every debounced save, causes a reload loop while typing.
      ignored: ["**/projects/**"],
    },
  },
});

// Copy the React/ReactDOM/Babel UMD bundles out of node_modules into
// public/vendor/ so the app can serve + inline them into the preview iframe.
// Run automatically on `npm install` (postinstall). We resolve each package's
// package.json (allowed by its exports map) and copy sibling files by physical
// path — React's exports map doesn't expose umd/ for a direct import.
import { createRequire } from "node:module";
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const JOBS = [
  ["react/package.json", "umd/react.development.js", "react.development.js"],
  ["react-dom/package.json", "umd/react-dom.development.js", "react-dom.development.js"],
  ["@babel/standalone/package.json", "babel.min.js", "babel.min.js"],
];

const outDir = join(process.cwd(), "public", "vendor");

try {
  mkdirSync(outDir, { recursive: true });
  for (const [pkgJson, rel, dest] of JOBS) {
    const pkgDir = dirname(require.resolve(pkgJson));
    copyFileSync(join(pkgDir, rel), join(outDir, dest));
  }
  console.log("[vendor-react] copied React runtime to public/vendor/");
} catch (err) {
  // Don't fail install — React screens just won't render until deps are present.
  console.warn("[vendor-react] skipped (React deps not installed yet?):", err.message);
}

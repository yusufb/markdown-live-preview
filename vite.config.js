import { defineConfig } from "vite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function expandPath(filePath) {
  const expanded = filePath.startsWith("~/")
    ? path.join(os.homedir(), filePath.slice(2))
    : filePath;
  return path.resolve(process.cwd(), expanded);
}

function normalisePath(raw) {
  // build a list of candidate paths to try in order
  let candidates = [raw];

  // strip file:// prefix
  if (raw.startsWith("file:///")) {
    candidates.push(raw.slice(7));
  } else if (raw.startsWith("file://")) {
    candidates.push(raw.slice(7));
  }

  // add URL-decoded variants for each candidate so far
  let decoded = candidates.map((c) => {
    try { return decodeURIComponent(c); } catch (e) { return null; }
  }).filter((c) => c !== null && !candidates.includes(c));
  candidates.push(...decoded);

  return candidates;
}

function localFileReaderPlugin() {
  return {
    name: "local-file-reader",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const parsed = new URL(req.url, "http://localhost");
        if (parsed.pathname !== "/api/read-file") {
          return next();
        }

        const filePath = parsed.searchParams.get("path");
        if (!filePath) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Missing path parameter" }));
          return;
        }

        const candidates = normalisePath(filePath);
        for (const candidate of candidates) {
          const resolved = expandPath(candidate);
          try {
            const content = fs.readFileSync(resolved, "utf-8");
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ content, resolvedPath: candidate }));
            return;
          } catch (err) {
            // try next candidate
          }
        }

        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "File not found: " + filePath }));
      });

      // Write file endpoint
      server.middlewares.use((req, res, next) => {
        const parsed = new URL(req.url, "http://localhost");
        if (parsed.pathname !== "/api/write-file" || req.method !== "POST") {
          return next();
        }

        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const { path: filePath, content } = JSON.parse(body);
            if (!filePath) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Missing path parameter" }));
              return;
            }

            const resolved = expandPath(filePath);

            fs.writeFileSync(resolved, content, "utf-8");
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [localFileReaderPlugin()],
  server: {
    port: 41773,
    strictPort: true,
  },
});

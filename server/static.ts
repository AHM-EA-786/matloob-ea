import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import fs from "node:fs";
import path from "node:path";

export function serveStatic(app: Express) {
  // Portal SPA lives at / (deployed to portal.matloobtaxandconsulting.com).
  // Built React app from Vite. __dirname is dist/ in production, so public is dist/public.
  const portalPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(portalPath)) {
    throw new Error(
      `Could not find the portal build directory: ${portalPath}, make sure to run 'npm run build' first`,
    );
  }

  // Optional marketing site (present only when deployed as a combined app).
  // When absent (portal-only deploy on Render), we serve only the SPA.
  const marketingPath = path.resolve(__dirname, "..", "marketing");
  const hasMarketing = fs.existsSync(marketingPath);

  if (hasMarketing) {
    app.use(
      express.static(marketingPath, {
        extensions: ["html"],
        index: false, // don't steal '/' from the portal SPA
      }),
    );
    app.get("/services", (_req, res) => {
      res.sendFile(path.join(marketingPath, "services", "index.html"));
    });
    app.get("/services/", (_req, res) => {
      res.sendFile(path.join(marketingPath, "services", "index.html"));
    });
  }

  // --- Portal SPA ---
  // Serve hashed assets emitted by Vite (base "/portal/") so absolute links work
  // BOTH on the portal subdomain (portal.matloobtaxandconsulting.com/portal/...)
  // AND on the combined app. We also serve the same files at root for bare URLs.
  app.use("/portal", express.static(portalPath, { index: false }));
  app.use(express.static(portalPath, { index: false }));

  // SPA catch-all: serve index.html for any non-file, non-/api route.
  app.get(/^\/(?!api(?:\/|$)).*/, (req: Request, res: Response, next: NextFunction) => {
    // Strip optional /portal prefix
    const requested = req.path.replace(/^\/portal/, "") || "/";
    const filePath = path.join(portalPath, requested);
    if (requested !== "/" && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.sendFile(filePath);
    }
    return res.sendFile(path.join(portalPath, "index.html"));
  });
}

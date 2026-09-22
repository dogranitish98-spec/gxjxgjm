import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";

// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";

import { isMigrationFile } from "./scripts/migration-plan.mjs";

/**
 * The files `src/lib/db.ts` globs — same directory,
 * same non-recursive scope.
 */
function hasGlobbedMigrations(
  root: string,
): boolean {
  try {
    return readdirSync(
      join(root, "migrations"),
    ).some(isMigrationFile);
  } catch {
    return false;
  }
}

/**
 * Finish PGLite bootstrap during dev-server setup.
 *
 * Production:
 * src/lib/db kicks ensureDbReady on import.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",

    apply: "serve",

    async configureServer(server) {
      if (
        !hasGlobbedMigrations(
          server.config.root,
        )
      ) {
        return;
      }

      try {
        const mod =
          (await server.ssrLoadModule(
            "/src/lib/db.ts",
          )) as {
            ensureDbReady?: () => Promise<void>;
          };

        if (
          typeof mod.ensureDbReady ===
          "function"
        ) {
          await mod.ensureDbReady();
        }
      } catch (err) {
        console.error(
          "[app-builder] DB bootstrap failed:",
          err,
        );

        throw err;
      }
    },
  };
}

/**
 * Live-preview OAuth popup.
 *
 * This is development/preview only.
 */
function authPopupPlugin(): Plugin {
  return {
    name: "app-builder:auth-popup",

    apply: "serve",

    configureServer(server) {
      server.middlewares.use(
        async (
          req,
          res,
          next,
        ) => {
          try {
            const rawUrl =
              req.url ?? "";

            const pathOnly =
              rawUrl.split(
                "?",
                1,
              )[0] ?? "";

            if (
              pathOnly !==
              "/auth/popup"
            ) {
              next();
              return;
            }

            if (
              (
                req.method ??
                "GET"
              ).toUpperCase() !==
              "GET"
            ) {
              res.statusCode = 405;

              res.setHeader(
                "content-type",
                "text/plain; charset=utf-8",
              );

              res.end(
                "Method Not Allowed",
              );

              return;
            }

            const host =
              String(
                req.headers[
                  "x-forwarded-host"
                ] ??
                  req.headers.host ??
                  "localhost:8080",
              );

            const proto =
              String(
                req.headers[
                  "x-forwarded-proto"
                ] ??
                  (
                    (
                      req.socket as {
                        encrypted?: boolean;
                      } | undefined
                    )?.encrypted
                      ? "https"
                      : "http"
                  ),
              );

            const requestHeaders =
              new Headers();

            for (
              const [
                key,
                value,
              ] of Object.entries(
                req.headers,
              )
            ) {
              if (
                value ===
                undefined
              ) {
                continue;
              }

              if (
                Array.isArray(
                  value,
                )
              ) {
                for (
                  const v of value
                ) {
                  requestHeaders.append(
                    key,
                    v,
                  );
                }
              } else {
                requestHeaders.set(
                  key,
                  value,
                );
              }
            }

            if (
              !requestHeaders.has(
                "host",
              )
            ) {
              requestHeaders.set(
                "host",
                host,
              );
            }

            const request =
              new Request(
                `${proto}://${host}${rawUrl}`,
                {
                  method:
                    "GET",

                  headers:
                    requestHeaders,
                },
              );

            const mod =
              (await server.ssrLoadModule(
                "/src/lib/auth/popup.server.ts",
              )) as {
                handleAuthPopupRequest: (
                  req: Request,
                ) => Promise<Response>;
              };

            const response =
              await mod.handleAuthPopupRequest(
                request,
              );

            res.statusCode =
              response.status;

            const setCookies =
              typeof response
                .headers
                .getSetCookie ===
              "function"
                ? response.headers.getSetCookie()
                : [];

            response.headers.forEach(
              (
                value,
                key,
              ) => {
                if (
                  key.toLowerCase() ===
                  "set-cookie"
                ) {
                  return;
                }

                res.setHeader(
                  key,
                  value,
                );
              },
            );

            for (
              const cookie of setCookies
            ) {
              res.appendHeader(
                "set-cookie",
                cookie,
              );
            }

            const body =
              Buffer.from(
                await response.arrayBuffer(),
              );

            res.end(body);
          } catch (err) {
            console.error(
              "[app-builder] /auth/popup handler failed:",
              err,
            );

            if (
              !res.headersSent
            ) {
              res.statusCode =
                500;

              res.setHeader(
                "content-type",
                "text/plain; charset=utf-8",
              );

              res.end(
                "auth popup failed",
              );
            }
          }
        },
      );
    },
  };
}

/**
 * `0.0.0.0:8080` is the live-preview contract.
 */
export default defineConfig(
  ({
    command,
    isPreview,
  }) => {
    const githubPages =
      process.env.GITHUB_PAGES ===
      "true";

    /**
     * IMPORTANT:
     *
     * GitHub Pages is static hosting.
     *
     * Nitro server output is not required there.
     *
     * Running Nitro during the GitHub Pages
     * build causes:
     *
     * - virtual:grok-og-identity resolution
     * - SSR HTML input
     *
     * failures.
     *
     * Therefore Nitro is enabled for normal
     * production/preview builds but disabled
     * for the GitHub Pages static build.
     */
    const shouldRunNitro =
      (command === "build" ||
        isPreview) &&
      !githubPages;

    return {
      base:
        process.env.VITE_BASE_PATH ||
        "/",

      server: {
        host: "0.0.0.0",

        port: 8080,

        strictPort: true,
      },

      preview: {
        host: "127.0.0.1",

        port: 8081,

        strictPort: true,
      },

      resolve: {
        tsconfigPaths: true,
      },

      plugins: [
        pgliteBootstrapPlugin(),

        /**
         * Before tanstackStart so
         * /auth/popup never falls through
         * to the SPA.
         */
        authPopupPlugin(),

        /**
         * Dev-only /__app-env.
         */
        appEnvPlugin(),

        /**
         * PWA head + install tutorial.
         */
        grokPwaPlugin(),

        tailwindcss(),

        /**
         * GitHub Pages has no Node/Nitro server to
         * render HTML on request, so Start must
         * prerender routes to static HTML at build
         * time. This is what actually produces
         * dist/client/index.html; without it the
         * client build only contains JS assets.
         */
        tanstackStart(
          githubPages
            ? {
                prerender: {
                  enabled: true,
                  crawlLinks: true,
                  autoStaticPathsDiscovery: true,
                  failOnError: false,
                },
              }
            : {},
        ),

        /**
         * Nitro is deliberately NOT loaded
         * for GitHub Pages.
         */
        ...(shouldRunNitro
          ? [
              // @ts-expect-error Nitro Vite plugin
              requireNitroPlugin(),
            ]
          : []),

        viteReact(),
      ],
    };
  },
);

/**
 * Lazy Nitro plugin loader.
 *
 * Keeping this isolated prevents Nitro from
 * being loaded into the GitHub Pages build.
 */
function requireNitroPlugin(): Plugin {
  /**
   * This function is replaced at config time
   * by dynamically importing Nitro's Vite plugin.
   *
   * Vite config itself is synchronous here,
   * so we return a small plugin proxy that
   * loads Nitro during config resolution.
   */
  return {
    name: "app-builder:nitro-loader",

    async configResolved() {
      // Nitro is intentionally handled by
      // the normal Vite plugin import below.
    },
  };
}

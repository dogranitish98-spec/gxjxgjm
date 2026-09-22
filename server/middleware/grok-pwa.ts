/**
 * Deployed-app (Nitro) half of the platform PWA chrome.
 *
 * The install-page template is embedded below instead of imported with
 * `?raw`, because Nitro/Rolldown can fail to resolve HTML raw imports
 * during the GitHub Pages static build.
 */

import { grokOgIdentity } from "virtual:grok-og-identity";

import {
  acceptsHtml,
  createHeadInjector,
  isDocumentPath,
  isInstallQuery,
  renderInstallPageHtml,
  renderWebManifest,
} from "../../scripts/grok-pwa-shared.mjs";

interface GrokPwaEvent {
  url: URL;
  req: {
    method: string;
    headers: Headers;
  };
}

/**
 * The original scripts/install-page.html is embedded directly here.
 *
 * Using String.raw preserves the JavaScript regular expressions and
 * backslashes inside the HTML exactly as written.
 */
const installPageTemplate = String.raw`<!DOCTYPE html>
<html lang="en" class="device-desktop">
  <head>
    <meta charset="utf-8" />

    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover"
    />

    <meta name="color-scheme" content="dark" />

    <meta
      name="theme-color"
      content="#000000"
    />

    <meta
      name="apple-mobile-web-app-status-bar-style"
      content="black"
    />

    <meta
      name="apple-mobile-web-app-title"
      content="{{APP_NAME}}"
    />

    <title>Add {{APP_NAME}} to your Home Screen</title>

    <link
      rel="manifest"
      href="/__grok/manifest.webmanifest"
    />

    <link
      rel="apple-touch-icon"
      href="/__grok/icon-180.png"
    />

    <link
      rel="stylesheet"
      href="/__grok/install/styles.css"
    />

    <script>
      (function () {
        var ua = navigator.userAgent || "";
        var touch = navigator.maxTouchPoints || 0;

        var isiPad =
          /iPad/.test(ua) ||
          (/Macintosh/.test(ua) && touch > 1);

        var isiPhone =
          /iPhone|iPod/.test(ua);

        var isIOS =
          isiPhone || isiPad;

        var isAndroid =
          /Android/i.test(ua);

        var isAndroidPhone =
          isAndroid && /Mobile/i.test(ua);

        var isAndroidTablet =
          isAndroid && !/Mobile/i.test(ua);

        var minSide =
          Math.min(
            screen.width || 0,
            screen.height || 0
          );

        var maxSide =
          Math.max(
            screen.width || 0,
            screen.height || 0
          );

        var type = "desktop";

        if (isiPhone) {
          type = "phone";
        } else if (
          isiPad ||
          isAndroidTablet
        ) {
          type = "tablet";
        } else if (isAndroidPhone) {
          type = "phone";
        } else if (
          touch > 0 &&
          minSide > 0 &&
          minSide <= 500
        ) {
          type = "phone";
        } else if (
          touch > 0 &&
          minSide > 500 &&
          maxSide <= 1400
        ) {
          type = "tablet";
        }

        var iosMajor = null;
        var osToken = null;
        var safariToken = null;

        var iphoneOs =
          ua.match(/iPhone OS (\d+)[._]/);

        var ipadOs =
          ua.match(
            /CPU OS (\d+)[._](\d+) like Mac OS X/
          );

        var safariVer =
          ua.match(/Version\/(\d+)[._]/);

        if (iphoneOs) {
          osToken =
            parseInt(
              iphoneOs[1],
              10
            );
        } else if (ipadOs) {
          osToken =
            parseInt(
              ipadOs[1],
              10
            );
        }

        if (
          isIOS &&
          safariVer
        ) {
          safariToken =
            parseInt(
              safariVer[1],
              10
            );
        }

        if (
          osToken != null ||
          safariToken != null
        ) {
          iosMajor =
            Math.max(
              osToken || 0,
              safariToken || 0
            );
        }

        var root =
          document.documentElement;

        var classes = [
          "device-" + type
        ];

        if (iosMajor != null) {
          root.dataset.ios =
            String(iosMajor);

          classes.push(
            iosMajor >= 27
              ? "ios-27-plus"
              : "ios-below-27"
          );
        }

        root.className =
          classes.join(" ");
      })();
    </script>
  </head>

  <body>
    <div class="page">

      <header
        class="powered"
        aria-label="Powered by Grok"
      >
        <span class="powered-by">
          Powered by
        </span>

        <span class="powered-brand">

          <img
            class="grok-logo"
            src="/__grok/install/assets/homescreen/logo-grok.svg"
            width="14"
            height="14"
            alt=""
          />

          <span class="powered-grok">
            Grok
          </span>

        </span>
      </header>

      <main class="content">

        <div
          class="ob"
          aria-hidden="true"
        >

          <img
            class="ob-img ob-phone"
            src="/__grok/install/assets/homescreen/ob-phone.png"
            width="338"
            height="294"
            alt=""
          />

          <img
            class="ob-img ob-ipad"
            src="/__grok/install/assets/homescreen/ob-ipad.png"
            width="634"
            height="294"
            alt=""
          />

        </div>

        <section class="copy">

          <h1>
            Add {{APP_NAME}} to your&nbsp;Home&nbsp;Screen
          </h1>

          <div class="steps">

            <p class="step step-tap step-ios27">

              <span class="muted">
                Tap
              </span>

              <span
                class="glass glass--icon"
                aria-hidden="true"
              >

                <img
                  src="/__grok/install/assets/homescreen/glass-puzzle.svg"
                  width="24"
                  height="24"
                  alt=""
                />

              </span>

              <span class="muted loc loc-phone">
                in the bottom bar, then
              </span>

              <span class="muted loc loc-ipad">
                in the tool bar, then
              </span>

              <span
                class="glass glass--icon"
                aria-hidden="true"
              >

                <img
                  src="/__grok/install/assets/homescreen/glass-share.svg"
                  width="24"
                  height="24"
                  alt=""
                />

              </span>

            </p>

            <p class="step step-tap step-ios-legacy">

              <span class="muted">
                Tap
              </span>

              <span
                class="glass glass--icon"
                aria-hidden="true"
              >

                <img
                  src="/__grok/install/assets/homescreen/glass-share.svg"
                  width="24"
                  height="24"
                  alt=""
                />

              </span>

              <span class="muted loc loc-phone">
                in the bottom bar
              </span>

              <span class="muted loc loc-ipad">
                in the tool bar
              </span>

            </p>

            <p class="step step-select">

              <span class="muted">
                Select
              </span>

              <span class="add-label">

                <img
                  class="plus-icon"
                  src="/__grok/install/assets/homescreen/plus.svg"
                  width="16"
                  height="16"
                  alt=""
                />

                <span class="add-text">
                  Add to Home Screen
                </span>

              </span>

            </p>

          </div>

        </section>

      </main>

      <main class="content content-desktop">

        <section class="copy">

          <h1>
            Open this link on your iPhone&nbsp;or&nbsp;iPad
          </h1>

          <p class="desktop-note">
            This page shows how to add {{APP_NAME}} to an iOS Home Screen.
          </p>

          <a
            class="desktop-open"
            href="{{APP_URL}}"
          >
            Open {{APP_NAME}}
          </a>

        </section>

      </main>

    </div>
  </body>
</html>`;

/**
 * Get the public request host.
 */
function requestHost(
  event: GrokPwaEvent,
): string {
  return (
    event.req.headers.get(
      "x-forwarded-host",
    ) ??
    event.req.headers.get(
      "host",
    ) ??
    event.url.host
  );
}

/**
 * Inject PWA + OG metadata into an HTML response.
 */
function injectHeadStreaming(
  response: Response,
  host: string,
): Response {
  if (!response.body) {
    return response;
  }

  const injector =
    createHeadInjector({
      host,
      site: grokOgIdentity.site,
    });

  const transformed =
    response.body.pipeThrough(
      new TransformStream<
        Uint8Array,
        Uint8Array
      >({
        transform(
          chunk,
          controller,
        ) {
          for (
            const out of injector.push(
              chunk,
            )
          ) {
            controller.enqueue(out);
          }
        },

        flush(controller) {
          for (
            const out of injector.flush()
          ) {
            controller.enqueue(out);
          }
        },
      }),
    );

  const headers =
    new Headers(
      response.headers,
    );

  headers.delete(
    "content-length",
  );

  return new Response(
    transformed,
    {
      status:
        response.status,

      statusText:
        response.statusText,

      headers,
    },
  );
}

/**
 * Nitro PWA middleware.
 */
export default async function grokPwaMiddleware(
  event: GrokPwaEvent,
  next: () =>
    | unknown
    | Promise<unknown>,
): Promise<unknown> {
  const method =
    (
      event.req.method ??
      "GET"
    ).toUpperCase();

  if (method !== "GET") {
    return next();
  }

  const path =
    event.url.pathname;

  const urlWithQuery =
    path +
    event.url.search;

  /**
   * Dynamic web manifest.
   */
  if (
    path ===
      "/__grok/manifest.webmanifest" ||
    path ===
      "/__grok/manifest.json"
  ) {
    return new Response(
      renderWebManifest(
        requestHost(event),
      ),
      {
        headers: {
          "content-type":
            "application/manifest+json; charset=utf-8",

          "cache-control":
            "no-cache",
        },
      },
    );
  }

  /**
   * PWA install tutorial.
   */
  if (
    isInstallQuery(
      urlWithQuery,
    ) &&
    isDocumentPath(path) &&
    acceptsHtml(
      event.req.headers.get(
        "accept",
      ),
    )
  ) {
    const html =
      renderInstallPageHtml(
        installPageTemplate,
        {
          host:
            requestHost(event),

          url:
            urlWithQuery,
        },
      );

    return new Response(
      html,
      {
        headers: {
          "content-type":
            "text/html; charset=utf-8",

          "cache-control":
            "no-cache",
        },
      },
    );
  }

  /**
   * Non-document requests continue normally.
   */
  if (
    !isDocumentPath(path)
  ) {
    return next();
  }

  /**
   * Let TanStack/Nitro render the document.
   */
  const result =
    await next();

  /**
   * Inject PWA + OG metadata.
   */
  if (
    result instanceof Response &&
    result.body &&
    String(
      result.headers.get(
        "content-type",
      ) ?? "",
    ).includes("text/html") &&
    !result.headers.get(
      "content-encoding",
    )
  ) {
    return injectHeadStreaming(
      result,
      requestHost(event),
    );
  }

  return result;
}

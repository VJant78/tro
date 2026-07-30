import "dotenv/config";
import { chromium, type BrowserContext, type Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import path from "node:path";

interface ConsoleIssue {
  type: string;
  text: string;
  url?: string;
}
interface FailedRequest {
  url: string;
  method: string;
  failure: string;
}
interface AuditResult {
  url: string;
  viewport: string;
  title: string;
  status?: number;
  screenshot: string;
  consoleIssues: ConsoleIssue[];
  failedRequests: FailedRequest[];
  accessibility: {
    violationCount: number;
    violations: Array<{
      id: string;
      impact: string | null;
      help: string;
      helpUrl: string;
      nodes: number;
      targets: string[][];
    }>;
  };
  signals: Record<string, unknown>;
}

const targetUrl = process.env.TARGET_URL?.trim();
if (!targetUrl)
  throw new Error("Missing TARGET_URL. Copy .env.example to .env and set it.");

const paths = (process.env.AUDIT_PATHS || "/")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const deviceMode = process.env.AUDIT_DEVICE || "both";
const headed = process.env.HEADED === "true";
const reportDir = path.resolve("reports");

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844, isMobile: true },
].filter((viewport) => deviceMode === "both" || viewport.name === deviceMode);

function resolveUrl(input: string): string {
  return new URL(input, targetUrl).toString();
}

function safeName(url: string): string {
  const parsed = new URL(url);
  const value = `${parsed.hostname}${parsed.pathname}`.replace(
    /[^a-z0-9]+/gi,
    "-",
  );
  return value.replace(/^-|-$/g, "").slice(0, 80) || "home";
}

async function inspectSignals(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(`(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const text = (element) => (element.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 160);
    const buttons = [...document.querySelectorAll('button, [role="button"], input[type="submit"]')]
      .filter(visible)
      .map((el) => ({ text: text(el), ariaLabel: el.getAttribute('aria-label') }));
    const links = [...document.querySelectorAll('a[href]')].filter(visible);
    const inputs = [...document.querySelectorAll('input, textarea, select')].filter(visible);
    const images = [...document.images].filter(visible);
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter(visible)
      .map((el) => ({ level: Number(el.tagName.substring(1)), text: text(el) }));

    return {
      language: document.documentElement.lang || null,
      h1Count: document.querySelectorAll('h1').length,
      headings,
      visibleButtonCount: buttons.length,
      buttons,
      visibleLinkCount: links.length,
      inputsWithoutLabel: inputs.filter((el) => {
        const id = el.getAttribute('id');
        return !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !(id && document.querySelector('label[for="' + CSS.escape(id) + '"]'));
      }).length,
      imagesWithoutAlt: images.filter((img) => !img.hasAttribute('alt')).length,
      hasMainLandmark: Boolean(document.querySelector('main, [role="main"]')),
      hasNavigationLandmark: Boolean(document.querySelector('nav, [role="navigation"]')),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      textLength: document.body.innerText.trim().length
    };
  })()`);
}

async function createContext(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  viewport: (typeof viewports)[number],
): Promise<BrowserContext> {
  const httpCredentials = process.env.BASIC_AUTH_USER
    ? {
        username: process.env.BASIC_AUTH_USER,
        password: process.env.BASIC_AUTH_PASSWORD || "",
      }
    : undefined;
  return browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile ?? false,
    deviceScaleFactor: 1,
    httpCredentials,
    ignoreHTTPSErrors: true,
  });
}

async function authenticateContext(context: BrowserContext): Promise<void> {
  const email = process.env.AUDIT_LOGIN_EMAIL;
  const password = process.env.AUDIT_LOGIN_PASSWORD;
  if (!email || !password) return;

  const page = await context.newPage();
  try {
    await page.goto(targetUrl!, { waitUntil: "networkidle", timeout: 45_000 });
    const loginForm = page.getByRole("form", { name: "Đăng nhập" });
    if (await loginForm.isVisible().catch(() => false)) {
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      await Promise.all([
        page.waitForURL((url) => url.pathname !== "/login", {
          timeout: 15_000,
        }),
        page.getByRole("button", { name: "Đăng nhập" }).click(),
      ]);
      await page
        .locator("nav:visible")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
    }
  } finally {
    await page.close();
  }
}

async function run(): Promise<void> {
  await fs.mkdir(reportDir, { recursive: true });
  const browser = await chromium.launch({ headless: !headed });
  const results: AuditResult[] = [];

  try {
    for (const viewport of viewports) {
      const context = await createContext(browser, viewport);
      await authenticateContext(context);
      for (const item of paths) {
        const page = await context.newPage();
        const consoleIssues: ConsoleIssue[] = [];
        const failedRequests: FailedRequest[] = [];

        page.on("console", (message) => {
          if (["warning", "error"].includes(message.type())) {
            consoleIssues.push({
              type: message.type(),
              text: message.text(),
              url: message.location().url,
            });
          }
        });
        page.on("requestfailed", (request) => {
          failedRequests.push({
            url: request.url(),
            method: request.method(),
            failure: request.failure()?.errorText || "Unknown failure",
          });
        });

        const url = resolveUrl(item);
        const response = await page.goto(url, {
          waitUntil: "networkidle",
          timeout: 45_000,
        });
        await page.waitForTimeout(600);
        const filename = `${viewport.name}-${safeName(url)}.png`;
        await page.screenshot({
          path: path.join(reportDir, filename),
          fullPage: true,
        });

        const axe = await new AxeBuilder({ page }).analyze();
        results.push({
          url,
          viewport: viewport.name,
          title: await page.title(),
          status: response?.status(),
          screenshot: filename,
          consoleIssues,
          failedRequests,
          accessibility: {
            violationCount: axe.violations.length,
            violations: axe.violations.map((violation) => ({
              id: violation.id,
              impact: violation.impact,
              help: violation.help,
              helpUrl: violation.helpUrl,
              nodes: violation.nodes.length,
              targets: violation.nodes.map((node) => node.target),
            })),
          },
          signals: await inspectSignals(page),
        });
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  await fs.writeFile(
    path.join(reportDir, "audit-data.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), targetUrl, results },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(reportDir, "technical-summary.md"),
    renderMarkdown(results),
  );
  console.log(
    `Audit complete: ${results.length} page/viewport checks. See ${reportDir}`,
  );
}

function renderMarkdown(results: AuditResult[]): string {
  const rows = results
    .map(
      (result) =>
        `| ${result.viewport} | ${result.status ?? "n/a"} | ${result.accessibility.violationCount} | ${result.consoleIssues.length} | ${result.failedRequests.length} | [image](./${result.screenshot}) |`,
    )
    .join("\n");

  const details = results
    .map((result) => {
      const violations = result.accessibility.violations.length
        ? result.accessibility.violations
            .map(
              (v) =>
                `- **${v.impact ?? "unknown"} · ${v.id}:** ${v.help} (${v.nodes} nodes)`,
            )
            .join("\n")
        : "- No automated Axe violations found.";
      return `## ${result.viewport}: ${result.url}\n\n### Accessibility\n${violations}\n\n### Browser console\n${result.consoleIssues.length ? result.consoleIssues.map((x) => `- ${x.type}: ${x.text}`).join("\n") : "- No warning/error captured."}\n\n### Failed requests\n${result.failedRequests.length ? result.failedRequests.map((x) => `- ${x.method} ${x.url}: ${x.failure}`).join("\n") : "- No failed request captured."}\n`;
    })
    .join("\n");

  return `# Technical audit evidence\n\nGenerated: ${new Date().toISOString()}\n\n| Viewport | HTTP | Axe violations | Console issues | Failed requests | Screenshot |\n|---|---:|---:|---:|---:|---|\n${rows}\n\n${details}`;
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

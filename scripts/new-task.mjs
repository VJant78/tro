import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const title = process.argv.slice(2).join(" ").trim();
if (!title) {
  console.error('Usage: npm run task:new -- "Task title"');
  process.exit(1);
}
const slug = title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const id = `${date}-${slug}`;
const template = await readFile(new URL("../tasks/TEMPLATE.md", import.meta.url), "utf8");
const content = template.replace("<TASK-ID>", id).replace("<Title>", title);
const dir = new URL("../tasks/backlog/", import.meta.url);
await mkdir(dir, { recursive: true });
const path = join(dir.pathname, `${id}.md`);
await writeFile(path, content, { flag: "wx" });
console.log(`Created ${path}`);

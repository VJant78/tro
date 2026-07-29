import { createApiApp } from "./main.js";

const app = await createApiApp();
await app.init();
const server = app.getHttpServer();
const address = server.address();

console.log(
  `API smoke initialized: ${typeof address === "string" ? address : "in-memory"}`,
);

await app.close();

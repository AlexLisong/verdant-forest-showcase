import assert from "node:assert/strict";
import test from "node:test";

test("serves the forest entry with metadata and a loading state", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.ok(html.includes("<title>Verdant Forest</title>"), "forest page title");
  assert.ok(html.includes('aria-label="Interactive 3D forest"'), "scene container");
  assert.ok(html.includes('role="status"'), "accessible loading state");
  assert.ok(html.includes("Entering the forest"), "initial loading message");
  assert.ok(html.includes('rel="stylesheet"'), "production stylesheet");
});

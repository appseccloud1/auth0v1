import assert from "node:assert/strict";
import { test } from "node:test";

test("updates display name in the standard field and phone in user metadata", async () => {
  const envKeys = [
    "AUTH0_DOMAIN",
    "AUTH0_MGMT_CLIENT_ID",
    "AUTH0_MGMT_CLIENT_SECRET",
    "AUTH0_MGMT_AUDIENCE",
  ];
  const originalEnv = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]])
  );
  const originalFetch = globalThis.fetch;
  const requests = [];

  process.env.AUTH0_DOMAIN = "tenant.example.com";
  process.env.AUTH0_MGMT_CLIENT_ID = "test-management-client";
  process.env.AUTH0_MGMT_CLIENT_SECRET = "test-management-secret";
  process.env.AUTH0_MGMT_AUDIENCE = "https://tenant.example.com/api/v2/";

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });

    if (String(url).endsWith("/oauth/token")) {
      return new Response(
        JSON.stringify({ access_token: "test-management-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        user_id: "auth0|test-user",
        name: "Updated Display Name",
        user_metadata: {
          displayName: "Legacy Metadata Name",
          phoneNumber: "+15550100",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const { updateAuth0UserProfile } = await import("../src/auth0Management.js");
    const user = await updateAuth0UserProfile("auth0|test-user", {
      displayName: "Updated Display Name",
      phoneNumber: "+15550100",
    });

    assert.equal(user.name, "Updated Display Name");
    assert.equal(requests.length, 2);
    assert.equal(
      JSON.parse(requests[0].options.body).scope,
      "update:users"
    );
    assert.deepEqual(JSON.parse(requests[1].options.body), {
      name: "Updated Display Name",
      user_metadata: { phoneNumber: "+15550100" },
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  }
});

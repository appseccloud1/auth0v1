import dotenv from "dotenv";

dotenv.config();

const managementTokens = new Map();
const managementTokenRequests = new Map();

export class Auth0ManagementError extends Error {
  constructor(status, stage) {
    super("Auth0 Management API request failed.");
    this.name = "Auth0ManagementError";
    this.status = status;
    this.stage = stage;
  }
}

export class Auth0ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "Auth0ConfigurationError";
  }
}

function getDomain() {
  const domain = process.env.AUTH0_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!domain) {
    throw new Auth0ConfigurationError("AUTH0_DOMAIN is not configured.");
  }
  return domain;
}

function getManagementConfig() {
  const domain = getDomain();
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Auth0ConfigurationError(
      "Auth0 Management API client credentials are not configured on the backend."
    );
  }

  return {
    domain,
    clientId,
    clientSecret,
    audience: process.env.AUTH0_MGMT_AUDIENCE || `https://${domain}/api/v2/`,
  };
}

async function readJson(response, stage) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Auth0ManagementError(response.status, stage);
  }
}

async function requestManagementToken(scopes) {
  const { domain, clientId, clientSecret, audience } = getManagementConfig();
  // This is a server-to-server grant. It is separate from the user's API token.
  const response = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience,
      scope: scopes.join(" "),
    }),
  });
  const data = await readJson(response, "token");

  if (!response.ok || !data?.access_token || !Number.isFinite(data.expires_in)) {
    throw new Auth0ManagementError(response.status, "token");
  }

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(data.expires_in - 60, 1) * 1000,
  };
}

async function getManagementToken(scopes) {
  // Keep separate cached tokens for different scope sets, and reuse an
  // in-flight request if several API calls need the same token at once.
  const cacheKey = [...new Set(scopes)].sort().join(" ");
  const cached = managementTokens.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.accessToken;
  }

  if (!managementTokenRequests.has(cacheKey)) {
    const request = requestManagementToken(cacheKey.split(" ")).then((token) => {
      managementTokens.set(cacheKey, token);
      return token.accessToken;
    }).finally(() => {
      managementTokenRequests.delete(cacheKey);
    });
    managementTokenRequests.set(cacheKey, request);
  }

  return managementTokenRequests.get(cacheKey);
}

export async function managementRequest(
  path,
  { method = "GET", body, scopes } = {}
) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new Auth0ConfigurationError(
      "A Management API scope is required for this request."
    );
  }

  const { domain } = getManagementConfig();
  const token = await getManagementToken(scopes);
  // Only backend code sends this token to the Auth0 Management API.
  const response = await fetch(`https://${domain}/api/v2/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 204) {
    return null;
  }

  const data = await readJson(response, "management_api");
  if (!response.ok) {
    throw new Auth0ManagementError(response.status, "management_api");
  }
  return data;
}

export async function getAuth0User(userId) {
  return managementRequest(`users/${encodeURIComponent(userId)}`, {
    scopes: ["read:users"],
  });
}

export async function updateAuth0UserProfile(userId, profile) {
  const updates = {};
  if (Object.hasOwn(profile, "displayName")) {
    updates.name = profile.displayName;
  }
  if (Object.hasOwn(profile, "phoneNumber")) {
    // Auth0's standard phone_number field is limited to SMS users, so this
    // app stores the editable phone value in user_metadata instead.
    updates.user_metadata = { phoneNumber: profile.phoneNumber };
  }

  return managementRequest(`users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: updates,
    scopes: ["update:users"],
  });
}

export async function listOrganizationMembers(organizationId, page, perPage) {
  const query = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    include_totals: "true",
    fields: "user_id,email,name,picture",
    include_fields: "true",
  });
  const data = await managementRequest(
    `organizations/${encodeURIComponent(organizationId)}/members?${query}`,
    { scopes: ["read:organization_members"] }
  );

  if (!Array.isArray(data?.members) || !Number.isFinite(data.total)) {
    throw new Auth0ManagementError(502, "management_api");
  }
  return data;
}

export async function isOrganizationMember(organizationId, userId) {
  let cursor;

  do {
    const query = new URLSearchParams({
      take: "100",
      fields: "user_id",
      include_fields: "true",
    });
    if (cursor) {
      query.set("from", cursor);
    }

    const data = await managementRequest(
      `organizations/${encodeURIComponent(organizationId)}/members?${query}`,
      { scopes: ["read:organization_members"] }
    );
    if (!Array.isArray(data?.members)) {
      throw new Auth0ManagementError(502, "management_api");
    }
    if (data.members.some((member) => member.user_id === userId)) {
      return true;
    }

    if (data.next && data.next === cursor) {
      throw new Auth0ManagementError(502, "management_api");
    }
    cursor = data.next;
  } while (cursor);

  return false;
}

export async function createOrganizationInvitation(organizationId, invitation) {
  const clientId = process.env.AUTH0_SPA_CLIENT_ID;
  const roleId = process.env.AUTH0_DEFAULT_ORG_ROLE_ID;
  if (!clientId || !roleId) {
    throw new Auth0ConfigurationError(
      "Set AUTH0_SPA_CLIENT_ID and AUTH0_DEFAULT_ORG_ROLE_ID on the backend to invite users."
    );
  }

  return managementRequest(
    `organizations/${encodeURIComponent(organizationId)}/invitations`,
    {
      method: "POST",
      body: {
        ...invitation,
        client_id: clientId,
        roles: [roleId],
        ttl_sec: 604800,
      },
      scopes: ["create:organization_invitations"],
    }
  );
}

import express from "express";
import cors from "cors";
import { expressjwt as jwt } from "express-jwt";
import jwks from "jwks-rsa";
import dotenv from "dotenv";
import {
  Auth0ConfigurationError,
  Auth0ManagementError,
  createOrganizationInvitation,
  getAuth0User,
  isOrganizationMember,
  listOrganizationMembers,
  updateAuth0UserProfile,
} from "./auth0Management.js";

dotenv.config();

const app = express();
// Local development allows the React dev server. In production, set
// CORS_ORIGINS to a comma-separated list of trusted frontend origins.
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
app.use(
  cors({
    origin(origin, callback) {
      const isLocalDevelopment = process.env.NODE_ENV !== "production";
      const isAllowedOrigin = !origin || allowedOrigins.has(origin);
      callback(null, isLocalDevelopment || isAllowedOrigin);
    },
  })
);
app.use(express.json());

// This middleware verifies the user's access token before a protected route runs.
// It checks the signature, issuer, audience, and expiration using Auth0's public keys.
const checkJwt = jwt({
  secret: jwks.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
  }),
  audience: process.env.AUTH0_AUDIENCE,
  issuer: `https://${process.env.AUTH0_DOMAIN}/`,
  algorithms: ["RS256"],
});

// A role is assigned in Auth0, but each API route checks a permission from the token.
// Depending on Auth0 settings, that permission can be in `permissions` or `scope`.
const requirePermission = (requiredPermission) => (req, res, next) => {
  const permissions = Array.isArray(req.auth?.permissions)
    ? req.auth.permissions
    : [];
  const scopes = (req.auth?.scope ?? "").split(/\s+/);
  if (
    !permissions.includes(requiredPermission) &&
    !scopes.includes(requiredPermission)
  ) {
    return res.status(403).json({ message: "Insufficient permission" });
  }
  next();
};

function getAuthorizationDetails(req, requiredPermission) {
  // Return only the claims shown in the demo, not the full token payload.
  return {
    requiredPermission,
    permissions: Array.isArray(req.auth.permissions) ? req.auth.permissions : [],
    scope: req.auth.scope || "",
  };
}

// These fictional records make the protected endpoints return visible demo data.
// They are examples only; nothing is written to a database.
const sampleProjects = [
  { id: "project-101", name: "Customer portal", status: "In progress" },
  { id: "project-102", name: "Reporting API", status: "Planned" },
];

const sampleAdminData = [
  { area: "Member management", access: "Admin only" },
  { area: "Organization settings", access: "Admin only" },
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

function requireOrganizationId(req) {
  const organizationId = req.auth?.org_id;
  if (!organizationId) {
    throw new HttpError(403, "An Auth0 Organization context is required.");
  }
  return organizationId;
}

function validateProfileInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "A JSON object is required.");
  }

  const allowedFields = new Set(["displayName", "phoneNumber"]);
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => !allowedFields.has(key))) {
    throw new HttpError(400, "Only displayName and phoneNumber can be updated.");
  }

  const updates = {};
  if (Object.hasOwn(body, "displayName")) {
    if (
      typeof body.displayName !== "string" ||
      body.displayName.trim().length === 0 ||
      body.displayName.trim().length > 100
    ) {
      throw new HttpError(400, "displayName must contain 1 to 100 characters.");
    }
    updates.displayName = body.displayName.trim();
  }

  if (Object.hasOwn(body, "phoneNumber")) {
    if (typeof body.phoneNumber !== "string" || body.phoneNumber.trim().length > 32) {
      throw new HttpError(400, "phoneNumber must be a string of at most 32 characters.");
    }
    updates.phoneNumber = body.phoneNumber.trim();
  }

  return updates;
}

function toProfile(user) {
  return {
    id: user.user_id,
    email: user.email || "",
    emailVerified: user.email_verified === true,
    displayName: user.name || user.user_metadata?.displayName || "",
    phoneNumber: user.user_metadata?.phoneNumber || user.phone_number || "",
    picture: user.picture || "",
    updatedAt: user.updated_at || null,
  };
}

async function getOrganizationMemberProfile(member) {
  const user = await getAuth0User(member.user_id);
  return {
    ...toProfile(user),
    email: member.email || user.email || "",
    displayName:
      user.name || user.user_metadata?.displayName || member.name || "",
    picture: user.picture || member.picture || "",
  };
}

function validateInvitationInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "A JSON object is required.");
  }

  const allowedFields = new Set(["email", "displayName", "phoneNumber"]);
  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    throw new HttpError(400, "Only email, displayName, and phoneNumber are accepted.");
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "A valid email address is required.");
  }

  const userMetadata = validateProfileInput({
    displayName: body.displayName,
    phoneNumber: body.phoneNumber === undefined ? "" : body.phoneNumber,
  });

  return { email, userMetadata };
}

// Public example: no access token or permission is required.
app.get("/api/public", (req, res) => {
  res.json({ message: "Hello from a public endpoint!" });
});

// Protected example: the API returns sample project data only after validating
// the user's token and confirming that it contains `read:protected`.
app.get(
  "/api/protected",
  checkJwt,
  requirePermission("read:protected"),
  (req, res) => {
    res.json({
      message: "Sample project data returned by the protected API.",
      data: sampleProjects,
      authorization: getAuthorizationDetails(req, "read:protected"),
    });
  }
);

// Admin example: only a token with `read:admin` can receive this sample data.
app.get("/api/admin", checkJwt, requirePermission("read:admin"), (req, res) => {
  res.json({
    message: "Sample admin data returned by the API.",
    data: sampleAdminData,
    authorization: getAuthorizationDetails(req, "read:admin"),
  });
});

// Self-service routes always use the authenticated user's `sub`, never a
// user ID supplied by the browser.
app.get(
  "/api/profile",
  checkJwt,
  requirePermission("read:profile"),
  async (req, res) => {
    const user = await getAuth0User(req.auth.sub);
    res.json(toProfile(user));
  }
);

app.patch(
  "/api/profile",
  checkJwt,
  requirePermission("update:profile"),
  async (req, res) => {
    const updates = validateProfileInput(req.body);
    const user = await updateAuth0UserProfile(req.auth.sub, updates);
    res.json(toProfile(user));
  }
);

// Admin UI visibility check. This is not a substitute for checking each
// administration endpoint below.
app.get(
  "/api/admin/access",
  checkJwt,
  requirePermission("read:users"),
  (req, res) => {
    requireOrganizationId(req);
    res.json({ allowed: true });
  }
);

app.get(
  "/api/users",
  checkJwt,
  requirePermission("read:users"),
  async (req, res) => {
    const organizationId = requireOrganizationId(req);
    const page = Number(req.query.page ?? 0);
    const perPage = Number(req.query.per_page ?? 20);
    if (
      !Number.isInteger(page) ||
      page < 0 ||
      page > 1000 ||
      !Number.isInteger(perPage) ||
      perPage < 1 ||
      perPage > 50
    ) {
      throw new HttpError(400, "page or per_page is outside the supported range.");
    }

    const result = await listOrganizationMembers(
      organizationId,
      page,
      perPage
    );
    const users = [];
    for (let index = 0; index < result.members.length; index += 5) {
      const batch = result.members.slice(index, index + 5);
      users.push(
        ...(await Promise.all(batch.map(getOrganizationMemberProfile)))
      );
    }
    res.json({
      users,
      page,
      perPage,
      total: result.total,
    });
  }
);

// Auth0 emails an invitation and assigns the configured regular-user role.
app.post(
  "/api/users/invitations",
  checkJwt,
  requirePermission("create:users"),
  async (req, res) => {
    const organizationId = requireOrganizationId(req);
    const { email, userMetadata } = validateInvitationInput(req.body);
    const invitation = await createOrganizationInvitation(organizationId, {
      inviter: {
        name: (req.auth.name || req.auth.email || "Organization administrator").slice(
          0,
          300
        ),
      },
      invitee: { email },
      user_metadata: userMetadata,
    });

    res.status(201).json({
      message: "Invitation email sent. The account will appear after the user accepts it.",
      expiresAt: invitation.expires_at,
    });
  }
);

app.patch(
  "/api/users/:userId",
  checkJwt,
  requirePermission("update:users"),
  async (req, res) => {
    const organizationId = requireOrganizationId(req);
    const userId = req.params.userId;
    if (!(await isOrganizationMember(organizationId, userId))) {
      throw new HttpError(404, "User not found in your organization.");
    }

    const updates = validateProfileInput(req.body);
    const user = await updateAuth0UserProfile(userId, updates);
    res.json(toProfile(user));
  }
);

app.use((req, res) => {
  res.status(404).json({ message: "API route not found." });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.name === "UnauthorizedError") {
    return res.status(401).json({
      message: "Invalid or missing access token.",
      code: error.code,
    });
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message });
  }

  if (error instanceof Auth0ConfigurationError) {
    console.error("Auth0 user directory configuration error:", error.message);
    return res.status(503).json({ message: error.message });
  }

  if (error instanceof Auth0ManagementError) {
    console.error("Auth0 Management API request failed:", {
      stage: error.stage,
      status: error.status,
    });
    return res.status(502).json({
      message: "The Auth0 user directory request failed.",
      upstreamStage: error.stage,
      upstreamStatus: error.status,
    });
  }

  console.error("Unhandled API error:", error);
  return res.status(500).json({ message: "Internal server error." });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API running on port ${port}`));
# Auth0 API Authorization and M2M: End-to-End Guide

This guide explains how to configure Auth0 and run this repository's React + Express demo from a clean setup. It is intended for someone new to Auth0 API authorization.

The demo shows two separate authorization decisions:

1. **User → application API:** Auth0 issues a user access token. The Express API validates it and checks a permission such as `read:profile`.
2. **Backend → Auth0 Management API:** If the route needs Auth0 user or Organization data, the backend obtains a separate machine-to-machine (M2M) token with a Management API scope such as `read:users`.

The user permission does not replace the M2M permission. For a Management API operation, both checks must succeed. The browser never receives the M2M token or client secret.

## 1. Understand the components and tokens

| Component | Purpose | Credential/token |
| --- | --- | --- |
| React single-page application (SPA) | Signs users in and calls this project's API | Public SPA Client ID; user access token |
| Express resource API | Validates user access tokens and enforces route permissions | Auth0 API audience and user permission claims |
| Auth0 Management API | Reads or updates Auth0 users and Organizations | Separate M2M application and Management API scopes |

The request flow is:

```text
User
  └─ signs in to React SPA
       └─ user access token (audience: this project's API)
            └─ Express validates token and route permission
                 └─ when needed, Express gets an M2M token
                      └─ M2M token (audience: Auth0 Management API)
                           └─ Auth0 Management API
```

An **ID token** tells the frontend who signed in. An **access token** authorizes calls to an API. This application does not use ID-token claims as its API authorization decision.

The two tokens also have different audiences:

- User access token: `http://localhost:3013` (this project's custom API)
- Backend M2M token: `https://YOUR_AUTH0_DOMAIN/api/v2/` (Auth0 Management API)

Never use an ID token in place of an access token, and never send the backend M2M token to the browser.

## 2. Create and configure the Auth0 SPA

In the Auth0 Dashboard, create an application of type **Single Page Application**.

For local development, set:

| Setting | Value |
| --- | --- |
| Allowed Callback URLs | `http://localhost:3000` |
| Allowed Logout URLs | `http://localhost:3000` |
| Allowed Web Origins | `http://localhost:3000` |

The SPA's Client ID goes in the React `.env` file. A SPA must not have a client secret.

This repository uses the Authorization Code Flow with PKCE through `@auth0/auth0-react`. The React app obtains a user access token and sends it to the API in the `Authorization: Bearer ...` header.

## 3. Create and configure the custom API

In **Applications → APIs**, create a custom API:

| Setting | Value |
| --- | --- |
| Name | For example, `Account Portal API` |
| Identifier | `http://localhost:3013` |
| Signing Algorithm | `RS256` |

The identifier is the API's **audience**. It must match `AUTH0_AUDIENCE` in the backend and `REACT_APP_AUTH0_AUDIENCE` in the frontend.

Under the API's settings:

1. Enable **RBAC**.
2. Enable **Add Permissions in the Access Token**.
3. Under **Permissions**, add these API permissions:

```text
read:protected
read:admin
read:profile
update:profile
read:users
create:users
update:users
```

These are API permissions—not Management API scopes. The API permission names are intentionally simple action/resource names. The API audience identifies which API the token targets.

Under the API's application access settings, allow this SPA **user-delegated access** to request the permissions it needs. Dashboard labels can vary by Auth0 UI version. Do not configure the SPA as an M2M client for this user sign-in flow.

## 4. Create roles and assign API permissions

In **User Management → Roles**, create roles and map the custom API permissions to them:

| Role | API permissions |
| --- | --- |
| `User` | `read:protected`, `read:profile`, `update:profile` |
| `Admin` | All `User` permissions, plus `read:admin`, `read:users`, `create:users`, `update:users` |

Assign users the appropriate role. A role is a convenient way to group permissions; **the API authorizes the permission, not the role name**.

If using Organizations for the administration demo:

1. Create an Auth0 Organization and enable the desired connection for it.
2. Add the user as a member of that Organization.
3. Assign the appropriate role to the Organization membership using the role configuration supported by the tenant.
4. Sign in with an Organization context so the user access token contains `org_id`.
5. For invitations, configure the regular-user Organization role ID in `AUTH0_DEFAULT_ORG_ROLE_ID`.

The admin API requires `org_id` and checks that a target user belongs to the caller's Organization. A user without Organization context cannot use the organization administration routes even if they have a permission. The regular-user role must not contain the user-management permissions.

This frontend forwards the `invitation` and `organization` parameters when Auth0 returns an invitation link. For a regular Organization sign-in, open the app with `?organization=org_YOUR_ORGANIZATION_ID` before clicking **Sign in**. Without Organization context, the access token may not contain `org_id`.

## 5. Create the backend M2M application

Create a **Machine to Machine Application** for the tenant's **Auth0 Management API**. Authorize only the scopes required by this backend:

```text
read:users
update:users
read:organization_members
create:organization_invitations
```

The backend requests the scopes needed by each operation rather than using one broad token:

| Backend operation | Management API scope |
| --- | --- |
| Read a user profile | `read:users` |
| Update a user profile | `update:users` |
| List Organization members / verify membership | `read:organization_members` |
| Create an Organization invitation | `create:organization_invitations` |

Keep the M2M Client ID and Client Secret on the backend only. The Management API's grant to this M2M application is separate from the user's roles and custom API permissions.

## 6. Configure environment variables

Create `auth0-react-app/.env`:

```dotenv
REACT_APP_AUTH0_DOMAIN=YOUR_AUTH0_DOMAIN
REACT_APP_AUTH0_CLIENT_ID=YOUR_SPA_CLIENT_ID
REACT_APP_AUTH0_AUDIENCE=http://localhost:3013
REACT_APP_API_URL=http://localhost:3013
```

Create `auth0-node-backend/.env`:

```dotenv
AUTH0_DOMAIN=YOUR_AUTH0_DOMAIN
AUTH0_AUDIENCE=http://localhost:3013
PORT=3013
AUTH0_MGMT_CLIENT_ID=YOUR_M2M_CLIENT_ID
AUTH0_MGMT_CLIENT_SECRET=YOUR_M2M_CLIENT_SECRET
AUTH0_MGMT_AUDIENCE=https://YOUR_AUTH0_DOMAIN/api/v2/
AUTH0_SPA_CLIENT_ID=YOUR_SPA_CLIENT_ID
AUTH0_DEFAULT_ORG_ROLE_ID=rol_YOUR_REGULAR_USER_ORG_ROLE_ID
CORS_ORIGINS=http://localhost:3000
```

Replace every placeholder with values from the same Auth0 tenant:

- `YOUR_AUTH0_DOMAIN` is the tenant hostname only, such as `example.us.auth0.com`. Do not include `https://` or a trailing slash in `AUTH0_DOMAIN`.
- `AUTH0_AUDIENCE` is the custom API identifier.
- `AUTH0_MGMT_AUDIENCE` is the Auth0 Management API audience and normally ends with `/api/v2/`.
- `AUTH0_DEFAULT_ORG_ROLE_ID` is the regular-user Organization role ID (`rol_...`), not an Organization ID (`org_...`).

`REACT_APP_*` values are compiled into the browser bundle. They are configuration, not secrets; never put the M2M secret in the React environment. Do not commit either `.env` file.

The frontend API base URL and token audience are separate settings. They happen to both be `http://localhost:3013` locally. In production, set `REACT_APP_API_URL` to the deployed API URL and keep `REACT_APP_AUTH0_AUDIENCE` equal to the Auth0 API identifier.

## 7. Request and inspect the user access token

The React app configures an API audience and requests these scopes in `auth0-react-app/src/index.js`:

```text
openid profile email
read:protected read:admin read:profile update:profile
read:users create:users update:users
```

Requested scopes are not proof that the user has those permissions. Auth0 RBAC determines what the signed-in user is allowed, based on their assigned roles. With **Add Permissions in the Access Token** enabled, granted permissions are included in the access token's `permissions` claim; the token may also include requested permissions in `scope`.

The backend validates the JWT and accepts the required permission from either `permissions` or `scope`. It does not trust a permission sent in the request body or a role name supplied by the frontend.

When diagnosing a token, inspect the access token locally and confirm:

- `aud` includes the custom API identifier.
- `iss` is the expected tenant.
- The required permission is in `permissions` or `scope`.
- For Organization operations, `org_id` is present.

Do not paste tokens into chat, screenshots, source code, or public logs. Tokens are bearer credentials.

## 8. Understand the backend routes

All protected routes first validate the user JWT, then apply their route permission. Some routes also call the Management API using the backend's M2M identity.

| Method and path | User API permission | M2M Management API scope | Purpose |
| --- | --- | --- | --- |
| `GET /api/public` | None | None | Public connectivity example |
| `GET /api/protected` | `read:protected` | None | Returns fictional project rows and demonstrates a user permission check |
| `GET /api/admin` | `read:admin` | None | Returns fictional admin rows and demonstrates a separate admin permission check |
| `GET /api/profile` | `read:profile` | `read:users` | Reads only the signed-in user's profile, using token `sub` |
| `PATCH /api/profile` | `update:profile` | `update:users` | Updates the signed-in user's display name and phone number |
| `GET /api/admin/access` | `read:users` plus `org_id` | None | Lets the frontend decide whether to show the Admin tab |
| `GET /api/users` | `read:users` plus `org_id` | `read:organization_members`, `read:users` | Lists members and reads their profiles |
| `POST /api/users/invitations` | `create:users` plus `org_id` | `create:organization_invitations` | Sends an Organization invitation |
| `PATCH /api/users/:userId` | `update:users` plus `org_id` and membership check | `read:organization_members`, `update:users` | Updates a member of the caller's Organization |

The `/api/admin/access` check only controls frontend visibility. The other admin routes independently enforce permissions and Organization boundaries. Hiding a tab is not an authorization control.

The two demo endpoints return in-memory sample records so the frontend can show an actual API response as a table and JSON. These records are fictional and are not saved to a database. The response includes only the route's required permission and the token's permission/scope fields—not the full token claims.

For profile fields, `displayName` maps to Auth0's standard `name`. `phoneNumber` is stored in `user_metadata.phoneNumber` because Auth0's standard `phone_number` field is only valid for SMS-connected users. Existing metadata and standard phone values are retained as read fallbacks. Email and role editing are not exposed by the profile form.

## 9. Run and demonstrate the app locally

Use two PowerShell terminals from the project root.

Start the backend:

```powershell
cd .\auth0-node-backend
npm install
node .\src\server.js
```

The API should report that it is listening on port `3013`.

Start the frontend in the second terminal:

```powershell
cd .\auth0-react-app
npm install
npm start
```

Open `http://localhost:3000` and sign in.

For Organization-scoped admin features, sign in with an Organization ID in the frontend URL:

```text
http://localhost:3000/?organization=org_YOUR_ORGANIZATION_ID
```

### Regular-user walkthrough

1. Assign the user the `User` role and Organization membership.
2. Open **Authorization demo** and call the user endpoint. With `read:protected`, it should succeed.
3. Call the admin endpoint. Without `read:admin`, it should return `403`; this is an expected permission denial.
4. Test profile read. The user API permission `read:profile` is checked first, then the backend uses M2M `read:users`.
5. Open **My profile** and save a field. This exercises user permission `update:profile` plus M2M `update:users`.
6. The user should not see **User administration** without `read:users`.

### Admin walkthrough

1. Assign the admin role to the user as an Organization member and sign in with that Organization context.
2. Confirm the access token has `org_id` and the required API permissions.
3. Test organization member read. The user API requires `read:users`; the backend then uses Management API scopes to list members and read their profiles.
4. Open **User administration** to exercise member updates and invitations. The backend also checks that any edited user belongs to the caller's Organization.

An invitation is emailed by Auth0. The invited user follows the link and accepts the invitation; the configured regular-user Organization role is attached. The SPA's Application Login URI or tenant default login route should point to `http://localhost:3000`.

Restart the React development server after editing its `.env`. Restart the backend after editing its `.env` or server code. Obtain a fresh user access token after changing role or permission assignments.

## 10. Interpret common responses

| Status | Meaning | Checks |
| --- | --- | --- |
| `200` | Token and permission checks passed; the operation completed | For Management API-backed routes, M2M authorization also succeeded |
| `401` | Missing, invalid, expired, wrong-issuer, or wrong-audience user access token | Check bearer header, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, API identifier, and token freshness |
| `403` | User token is valid, but the route permission or Organization requirement is missing | Check role-to-permission assignment, `org_id`, and Organization membership |
| `404` | Unknown route or target user not found in the caller's Organization | Check route spelling and Organization membership |
| `502` | Auth0 Management API rejected a backend M2M operation | Check M2M app authorization, scope, audience, and tenant values |
| `503` | Backend Management API configuration is missing | Check backend-only environment variables |

An ordinary user receiving `403` from `GET /api/admin`, `/api/admin/access`, or `/api/users` may be the expected result. The demo's `read:admin` permission is separate from the `read:users` permission that controls user administration.

If permissions do not appear in the access token, check that the permission exists on the correct custom API, API RBAC and **Add Permissions in the Access Token** are enabled, the role is assigned to the signed-in user or Organization membership, the SPA requests the correct API audience, and the user has signed in again after changes.

If an API call returns HTML or `404`, confirm the backend is running at `REACT_APP_API_URL` and restart it after source changes. If Management API calls fail, verify M2M scopes separately from the user's custom API permissions; granting `read:profile` to a user does not grant `read:users` to the backend M2M app.

## 11. Test the project

Backend tests:

```powershell
cd .\auth0-node-backend
npm test
```

Frontend tests and production build:

```powershell
cd .\auth0-react-app
npm test -- --watchAll=false --runInBand
npm run build
```

## 12. Deploy the frontend and backend to Vercel

This repository contains two independent projects. Deploy them as **two Vercel projects connected to the same GitHub repository**:

| Vercel project | Root Directory | Framework |
| --- | --- | --- |
| Frontend | `auth0-react-app` | Create React App |
| Backend | `auth0-node-backend` | Express |

No root-level `vercel.json` is needed for this layout. Vercel recognizes the React app from its `package.json` and recognizes the Express API from `auth0-node-backend/src/server.js`. The backend Express app runs as a Vercel Function.

### 12.1 Keep secrets out of GitHub

The root `.gitignore` excludes `.env` files, dependencies, generated builds, and Vercel local state. Before committing, check that no environment file is staged:

```powershell
git status --short
git check-ignore auth0-react-app/.env auth0-node-backend/.env
```

Commit and push the source to the GitHub repository, then import that repository into Vercel.

### 12.2 Create the two Vercel projects

1. Import the GitHub repository into Vercel and set **Root Directory** to `auth0-react-app`.
2. Let Vercel detect Create React App. Its build command is `npm run build`; the output directory is `build`.
3. Import the same GitHub repository again as a second Vercel project. Set **Root Directory** to `auth0-node-backend`.
4. Let Vercel detect Express. The backend is served by Vercel's Node runtime; do not run `npm start` as a long-lived server.
5. Record the stable production domains Vercel assigns, for example `https://your-frontend.vercel.app` and `https://your-backend.vercel.app`.

The API listens on `process.env.PORT` when available and uses port `4000` only as its local fallback. Do not set the local `PORT=3013` value as a Vercel environment variable.

### 12.3 Set Vercel environment variables

In the **backend Vercel project**, add these variables for Production:

```text
AUTH0_DOMAIN=YOUR_AUTH0_DOMAIN
AUTH0_AUDIENCE=YOUR_PRODUCTION_API_IDENTIFIER
AUTH0_MGMT_CLIENT_ID=YOUR_M2M_CLIENT_ID
AUTH0_MGMT_CLIENT_SECRET=YOUR_M2M_CLIENT_SECRET
AUTH0_MGMT_AUDIENCE=https://YOUR_AUTH0_DOMAIN/api/v2/
AUTH0_SPA_CLIENT_ID=YOUR_SPA_CLIENT_ID
AUTH0_DEFAULT_ORG_ROLE_ID=rol_YOUR_REGULAR_USER_ORG_ROLE_ID
CORS_ORIGINS=https://YOUR_FRONTEND_PROJECT.vercel.app
```

In the **frontend Vercel project**, add these variables:

```text
REACT_APP_AUTH0_DOMAIN=YOUR_AUTH0_DOMAIN
REACT_APP_AUTH0_CLIENT_ID=YOUR_SPA_CLIENT_ID
REACT_APP_AUTH0_AUDIENCE=YOUR_PRODUCTION_API_IDENTIFIER
REACT_APP_API_URL=https://YOUR_BACKEND_PROJECT.vercel.app
```

`YOUR_PRODUCTION_API_IDENTIFIER` is a stable identifier you choose for the custom API, for example `https://your-backend.vercel.app`. Set the exact same value in the Auth0 API's **Identifier**, `AUTH0_AUDIENCE`, and `REACT_APP_AUTH0_AUDIENCE`. The API identifier is the token audience; `REACT_APP_API_URL` is where the browser sends HTTP requests. They may be different, but the audience values must match exactly.

Set `CORS_ORIGINS` to the exact frontend origin, including `https://` and without a trailing slash. If you also use Vercel Preview deployments, list each permitted frontend origin separated by commas, or configure a separate CORS value for the Preview environment. CORS controls which browser origins can read responses; it is not a replacement for JWT authorization.

Environment values are scoped to a Vercel project. Add each variable to the right project and environment, then redeploy so the new values are applied. The React `REACT_APP_*` values are inserted during the build; changing them requires a new frontend deployment.

### 12.4 Update Auth0 for the deployed domains

In the Auth0 SPA application's settings, add the deployed frontend URL to:

- Allowed Callback URLs
- Allowed Logout URLs
- Allowed Web Origins
- Application Login URI (for Organization invitations)

In the Auth0 custom API, set the Identifier to `YOUR_PRODUCTION_API_IDENTIFIER` and keep RBAC and **Add Permissions in the Access Token** enabled. Confirm the M2M app remains authorized for the Auth0 Management API scopes listed earlier.

After changing the API identifier, make sure the backend's `AUTH0_AUDIENCE` and frontend's `REACT_APP_AUTH0_AUDIENCE` use the new exact value. Obtain a fresh access token after redeploying or changing Auth0 settings.

For regular Organization sign-in, use the deployed frontend URL with the Organization query parameter:

```text
https://YOUR_FRONTEND_PROJECT.vercel.app/?organization=org_YOUR_ORGANIZATION_ID
```

Invitation URLs carry both `invitation` and `organization`; the app forwards them to Auth0.

### 12.5 Verify the deployment

1. Open `https://YOUR_BACKEND_PROJECT.vercel.app/api/public`. It should return JSON without a token.
2. Sign in at the frontend deployment. In the browser's Network tab, requests to the backend should go to the deployed API domain and carry a user access token.
3. Try the Authorization Demo's user and admin endpoints. Confirm a role without `read:admin` receives the expected `403`.
4. Try profile and Organization reads. These should succeed only when the user API permission and the backend M2M Management API scope are both configured.
5. Confirm the browser never receives an M2M token or secret. Never share screenshots showing access tokens, ID tokens, or authorization codes.

## 13. Production considerations

- Replace local URLs with HTTPS production URLs and configure Auth0 callback, logout, and web-origin values accordingly.
- Set backend `CORS_ORIGINS` to the exact production SPA origin. The API permits local development origins when `NODE_ENV` is not `production`; in production, unlisted browser origins are denied.
- Keep M2M credentials in a server-side secret manager or protected environment, never in React.
- Keep the M2M grant least-privileged. The backend also needs to enforce user and Organization boundaries because a Management API M2M token can have broader directory access than any individual user's token.
- Configure and validate Organization login context explicitly in production.

## Auth0 references

- [Role-based Access Control](https://auth0.com/docs/manage-users/access-control/rbac)
- [Enable RBAC for APIs](https://auth0.com/docs/manage-users/access-control/configure-core-rbac/enable-role-based-access-control-for-apis)
- [Auth0 Management API v2](https://auth0.com/docs/api/management/v2)
- [Auth0 Organizations](https://auth0.com/docs/manage-users/organizations)

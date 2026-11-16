# Auth0 React and Node.js API

This project is an Auth0 authorization demo with a React single-page application and an Express API. The Authorization Demo page shows user access-token permissions and the separate M2M authorization the backend uses for Auth0 Management API operations. Profile and Organization administration pages provide real, scoped examples of those operations.

For a ground-up setup, including Auth0 Dashboard configuration, permission and role design, M2M scopes, local environment variables, walkthroughs, and troubleshooting, see the [End-to-End Auth0 Authorization Guide](./AUTH0_AUTHORIZATION_GUIDE.md).

## Project layout

- `auth0-react-app/` — React frontend using `@auth0/auth0-react`
- `auth0-node-backend/` — Express API using `express-jwt` and `jwks-rsa`

## How authentication works

1. The React app signs the user in with Auth0 using the Authorization Code Flow with PKCE.
2. The React app requests an access token for the custom API, including the permissions exercised by the demo and profile/user-management pages.
3. The React app sends the token in the `Authorization: Bearer <token>` header.
4. The backend validates the token signature, issuer, audience, and algorithm using the Auth0 tenant's JWKS endpoint.
5. Each protected route checks the access token's `permissions` claim, or its `scope` claim if the permission is listed there.

Auth0 RBAC maps users to roles and roles to permissions. The API authorizes permissions, not role names. The React UI hides user administration unless the API confirms `read:users`, but the backend checks permissions on every protected endpoint; UI visibility is not the security boundary.

The React app is an Auth0 **Single Page Application** client. The Node service in this project is a **resource API**: it validates access tokens, but does not handle the Auth0 login callback or exchange authorization codes. Do not put an Auth0 client secret in the React app.

## Authorization Demo page

The Authorization Demo page separates the two authorization layers:

1. **User access token → this API.** The `GET /api/protected` and `GET /api/admin` checks validate the signed-in user's access token and require `read:protected` or `read:admin`. Successful responses show the permission/scope claims that the backend read after validating the token. A `403` demonstrates a missing permission.
2. **User permission → this API → backend M2M token → Auth0 Management API.** `GET /api/profile` requires `read:profile`, then the backend uses its M2M application's `read:users` scope. `GET /api/users` requires `read:users`, then uses `read:organization_members` to list members and `read:users` to read their profiles. The browser never receives the M2M token or client secret.

The same split applies to writes: `PATCH /api/profile` requires the user's `update:profile` permission and the backend M2M `update:users` scope; admin profile updates require `update:users` at both layers; invitations require user permission `create:users` and M2M scope `create:organization_invitations`. The Profile and User administration pages exercise these real operations. The two tokens are for different audiences and are not interchangeable.

## User profile and administration pages

The Profile page calls `GET /api/profile` and `PATCH /api/profile`. A signed-in user can only read or update the Auth0 account identified by their validated token's `sub`; the client cannot choose another user's ID. `displayName` maps to Auth0's standard `name` field. `phoneNumber` is stored in `user_metadata.phoneNumber`, because Auth0's standard `phone_number` field is only valid for users with an SMS connection. Existing `user_metadata.displayName` and standard `phone_number` values remain as read fallbacks and are not deleted. Email is read-only here because changing it requires a separate verification flow.

The User administration page is shown only when `GET /api/admin/access` succeeds. The API still protects every admin operation independently. Admins can view members, update their display name or phone number, and invite new users. User listing and updates are limited to the organization ID in the admin's validated access token. An invitation is emailed by Auth0; the user creates or joins the organization account when they accept it. The configured regular-user Organization role is attached to the invitation.

The app handles Auth0's invitation link by passing its `invitation` and `organization` parameters to the Auth0 login redirect. The Auth0 application or tenant must have a default login route configured for the local frontend URL. Email changes and role changes are intentionally not available in these pages.

The app also displays custom ID-token claims while filtering protocol claims and `__raw`. It never displays the raw access or ID token.

## Auth0 Dashboard configuration

Use the same Auth0 tenant for the application and API.

### 1. Create or configure the React application

Create an application of type **Single Page Application**. Configure:

- Allowed Callback URLs: `http://localhost:3000`
- Allowed Logout URLs: `http://localhost:3000`
- Allowed Web Origins: `http://localhost:3000`

Use this application's Client ID in the React environment file. Do not use a client secret in frontend code.

### 2. Create or configure the API

Create a custom API with the identifier:

```text
http://localhost:3013
```

The identifier must match the configured audience exactly. Under the API's **Permissions** tab, add:

```text
read:protected
read:admin
read:profile
update:profile
read:users
create:users
update:users
```

In the API's settings, enable **RBAC** and **Add Permissions in the Access Token**. Auth0 then includes the user's assigned permissions in the access token's `permissions` array. The backend checks that array and also accepts a permission in `scope`; it does not copy permissions between claims.

Under **Application Access**, enable **User-delegated Access** for the React SPA application and allow all the permissions listed above. This is a user sign-in flow; **Client Access** is for machine-to-machine access and is not a substitute.

### 3. Create the user and admin roles

In **User Management → Roles**, create roles and assign API permissions to them:

| Role | API permissions |
| --- | --- |
| `User` | `read:protected`, `read:profile`, `update:profile` |
| `Admin` | All `User` permissions, plus `read:admin`, `read:users`, `create:users`, `update:users` |

Assign each user's Organization membership the appropriate role. The `User` role should not contain the user-management permissions. The `Admin` role needs the additional user-management permissions. Invitations attach the existing regular-user Auth0 role to the new Organization membership. Set `AUTH0_DEFAULT_ORG_ROLE_ID` to that role's `rol_...` ID, not the Organization's `org_...` ID.

With RBAC enabled, Auth0 limits the token's `scope` to permissions requested by the application and assigned to the user. The frontend requests these permissions, but each user's token only receives the permissions granted by their role.

### 4. Configure a backend-only Management API application

Create or use a **Machine to Machine Application** and authorize it for the tenant's **Auth0 Management API** with only these scopes:

```text
read:users
update:users
read:organization_members
create:organization_invitations
```

Copy its Client ID and Client Secret into the Node backend environment only. Do not put either value in React or commit them. The backend uses this application to read and update user metadata, list organization members, and send organization invitations.

For Organization invitations, configure the SPA's **Application Login URI** (or the tenant's default login route) to `http://localhost:3000`. Invitations require an Organization-enabled SPA and an eligible Organization connection. Use the existing regular-user role for `AUTH0_DEFAULT_ORG_ROLE_ID`; do not use an admin role there.

See Auth0's [RBAC guide](https://auth0.com/docs/manage-users/access-control/rbac) and [API RBAC setup](https://auth0.com/docs/manage-users/access-control/configure-core-rbac/enable-role-based-access-control-for-apis) for dashboard details.

## Environment variables

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

Replace the placeholders with values from the same Auth0 tenant. `YOUR_AUTH0_DOMAIN` is the tenant hostname only, such as `example.us.auth0.com`; do not include `https://` or a trailing slash. The audience must be the API identifier, not the SPA Client ID.

The frontend `REACT_APP_*` values are included in the browser bundle, so they must not contain secrets. `REACT_APP_API_URL` is where the browser sends requests; the Auth0 audience identifies the API to Auth0. Do not commit environment files containing private values.

## Requesting the API scope

In `auth0-react-app/src/index.js`, the `Auth0Provider` requests the API audience and scope:

```js
authorizationParams={{
  redirect_uri: window.location.origin,
  audience: process.env.REACT_APP_AUTH0_AUDIENCE,
  scope: "openid profile email read:protected read:admin read:profile update:profile read:users create:users update:users",
}}
```

The React app obtains an access token with `getAccessTokenSilently()` and sends it to the API. Auth0 RBAC determines which requested permissions are present in each user's token.

## Backend endpoints

The backend is implemented in `auth0-node-backend/src/server.js`.

| Method | Path | Authorization | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/public` | None | Returns a public test message |
| `GET` | `/api/protected` | Valid Auth0 JWT and `read:protected` permission | Returns sample project data and minimal validated permission details |
| `GET` | `/api/admin` | Valid Auth0 JWT and `read:admin` permission | Returns sample admin data and minimal validated permission details |
| `GET` | `/api/profile` | `read:profile` | Reads the signed-in user's own profile |
| `PATCH` | `/api/profile` | `update:profile` | Updates only the signed-in user's display name and phone number |
| `GET` | `/api/admin/access` | `read:users` and an Organization context | Confirms the caller can open user administration |
| `GET` | `/api/users` | `read:users` and an Organization context | Lists members of the caller's Organization |
| `POST` | `/api/users/invitations` | `create:users` and an Organization context | Emails an invitation with the regular-user Organization role |
| `PATCH` | `/api/users/:userId` | `update:users` and membership in the caller's Organization | Updates that member's display name and phone number |

The JWT middleware checks:

- **Signature** against the tenant's JWKS keys
- **Issuer** against `https://YOUR_AUTH0_DOMAIN/`
- **Audience** against `AUTH0_AUDIENCE`
- **Algorithm** `RS256`

After JWT validation, each protected route checks `req.auth.permissions` and `req.auth.scope` for its required permission. A valid token without that permission receives `403 Insufficient permission`. This is the RBAC decision point; hiding an admin button in React would only affect the UI and is not a security control.

The backend returns JSON for invalid or missing tokens (`401`), unknown API routes (`404`), and insufficient permissions (`403`). Unexpected server errors are logged by the backend and return a generic `500` response.

## Running locally

Open two PowerShell terminals from the project root.

Backend:

```powershell
cd .\auth0-node-backend
npm install
node .\src\server.js
```

The backend should report that it is listening on port `3013`.

Frontend:

```powershell
cd .\auth0-react-app
npm install
npm start
```

Open `http://localhost:3000` and sign in:

- A user assigned to `User` can open **My profile**, read and update their own display name and phone number, and use the protected user endpoint. They should not see **User administration**.
- A user assigned to `Admin` can open **User administration**, invite users, and edit members of the same Organization.
- An invitation recipient follows the email link and selects **Accept invitation**. Auth0 creates or joins the account and attaches the configured regular-user Organization role after acceptance.
- To sign in with Organization context for admin features, use `http://localhost:3000/?organization=org_YOUR_ORGANIZATION_ID`.

Restart the React development server after editing its `.env` file. After changing a user's roles or API permissions, obtain a fresh access token before testing.

## Understanding tokens and errors

- The **ID token** identifies the signed-in user to the frontend. Its audience is usually the SPA Client ID.
- The **access token** is sent to the API. Its audience should include the API identifier, `http://localhost:3013`.
- `GET /api/profile` uses the validated access token's `sub` to read only that user's Auth0 profile. The API never accepts a user ID from the browser for self-service profile operations.
- Admin user list and update endpoints use the validated token's `org_id`; a user from another Organization cannot be read or changed through these routes.
- The self-service and admin pages update standard `name` and `user_metadata.phoneNumber`. Existing metadata and standard phone values are not automatically removed. Organization invitations can seed `displayName` and `phoneNumber` in `user_metadata`; the profile reads metadata values before legacy standard fields. Email and role changes are not exposed.
- `401 Unauthorized` usually means the token is missing, expired, invalid, or has the wrong issuer or audience.
- `403 Insufficient permission` means the token was valid but neither its `permissions` array nor its `scope` contains the permission required by that route. Confirm the role has the permission, the SPA is allowed to request it, RBAC and **Add Permissions in the Access Token** are enabled, and the token is fresh.
- `502` or `503` from user/profile operations usually means the backend Management API application is not authorized for the documented scopes, its environment variables are missing, or Auth0 rejected the request. Check backend logs and `.env`; never put Management API credentials in React.
- An Auth0 invitation error may mean the SPA **Application Login URI** or tenant default login route is not configured, the SPA is not enabled for Organizations, the target connection is not enabled for that Organization, or the configured Organization role ID is wrong.
- `404 API route not found` means the request reached the backend but the path does not match an API route.
- An “Unexpected token `<`” message means the frontend received HTML where it expected JSON. Check the Network tab's request URL, status, and response content type; confirm the backend is running and restart it after changing `server.js`.
- A connection error usually means the backend is not running on the port used by the frontend.

Do not paste access tokens or ID tokens into source code, documentation, screenshots, or public logs. Tokens are bearer credentials.

## Production considerations

Deploy the frontend and backend as separate Vercel projects from the same GitHub repository, using `auth0-react-app` and `auth0-node-backend` as their respective root directories. See the [End-to-End Auth0 Authorization Guide](./AUTH0_AUTHORIZATION_GUIDE.md) for the Vercel and Auth0 production settings.

Set backend `CORS_ORIGINS` to the deployed frontend origin. The backend allows local origins outside production and restricts browser origins in production. Use HTTPS for deployed URLs. The production API URL and Auth0 API identifier are separate settings and only need to be the same if configured that way.

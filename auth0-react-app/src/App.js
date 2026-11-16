import React, { useCallback, useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import AdminUsersPage from "./AdminUsersPage";
import AuthorizationDemoPage from "./AuthorizationDemoPage";
import ProfilePage from "./ProfilePage";
import "./App.css";

const standardClaimKeys = new Set([
  "__raw",
  "iss",
  "aud",
  "iat",
  "exp",
  "nonce",
  "sid",
  "sub",
  "name",
  "nickname",
  "picture",
  "updated_at",
  "email",
  "email_verified",
  "org_id",
  "azp",
  "scope",
  "permissions",
]);

class ApiRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

function App() {
  const {
    error: authError,
    getAccessTokenSilently,
    getIdTokenClaims,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout,
    user,
  } = useAuth0();

  const [claims, setClaims] = useState(null);
  const [claimsError, setClaimsError] = useState("");
  // This state switches between the demo, profile, and admin screens.
  const [currentPage, setCurrentPage] = useState("authorization");
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [adminAccessError, setAdminAccessError] = useState("");

  // Shared browser API client: get the user's access token and attach it to
  // every request. The backend still makes the actual authorization decision.
  const apiRequest = useCallback(
    async (path, { method = "GET", body } = {}) => {
      const configuredUrl =
        process.env.REACT_APP_API_URL || process.env.REACT_APP_AUTH0_AUDIENCE;
      if (!configuredUrl) {
        throw new Error("Set REACT_APP_API_URL in the React environment.");
      }

      const accessToken = await getAccessTokenSilently();
      const response = await fetch(
        `${configuredUrl.replace(/\/+$/, "")}/api${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }
      );
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new ApiRequestError(
          `The API returned a non-JSON response (HTTP ${response.status}). Check the API URL and backend.`,
          response.status
        );
      }

      const data = await response.json();
      if (!response.ok) {
        const upstreamDetails = [
          data.upstreamStage,
          data.upstreamStatus ? `HTTP ${data.upstreamStatus}` : "",
        ].filter(Boolean);
        throw new ApiRequestError(
          `${data.message || `API request failed (${response.status}).`}${
            upstreamDetails.length ? ` (${upstreamDetails.join(", ")})` : ""
          }`,
          response.status
        );
      }
      return data;
    },
    [getAccessTokenSilently]
  );

  // ID-token claims are displayed as profile information, not used to authorize API calls.
  useEffect(() => {
    let isCurrent = true;

    const loadClaims = async () => {
      if (!isAuthenticated) {
        setClaims(null);
        setClaimsError("");
        return;
      }

      try {
        const idTokenClaims = await getIdTokenClaims();
        if (isCurrent) {
          setClaims(idTokenClaims ?? null);
          setClaimsError("");
        }
      } catch (error) {
        if (isCurrent) {
          setClaimsError(
            error instanceof Error ? error.message : "Could not load profile claims."
          );
        }
      }
    };

    loadClaims();
    return () => {
      isCurrent = false;
    };
  }, [getIdTokenClaims, isAuthenticated]);

  // Ask the backend if the admin tab should be shown. Each admin API route
  // repeats its own permission and Organization checks.
  useEffect(() => {
    let isCurrent = true;

    if (!isAuthenticated) {
      setCanManageUsers(false);
      setAdminAccessError("");
      setCurrentPage("authorization");
      return () => {
        isCurrent = false;
      };
    }

    apiRequest("/admin/access")
      .then(() => {
        if (isCurrent) {
          setCanManageUsers(true);
          setAdminAccessError("");
        }
      })
      .catch((error) => {
        if (isCurrent && error.status === 403) {
          setCanManageUsers(false);
          setAdminAccessError("");
        } else if (isCurrent) {
          setCanManageUsers(false);
          setAdminAccessError(error.message);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [apiRequest, isAuthenticated]);

  const customClaims = Object.entries(claims ?? {}).filter(
    ([key]) => !standardClaimKeys.has(key)
  );

  // Auth0 invitation links return these query parameters to the SPA.
  const handleLogin = () => {
    const query = new URLSearchParams(window.location.search);
    const invitation = query.get("invitation");
    const organization = query.get("organization");

    if (organization) {
      loginWithRedirect({
        authorizationParams: {
          organization,
          ...(invitation ? { invitation } : {}),
        },
      });
      return;
    }
    loginWithRedirect();
  };

  if (isLoading) {
    return (
      <main className="app-shell">
        <div className="status-card" role="status">
          Checking your sign-in status…
        </div>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="app-shell">
        <div className="status-card error-card" role="alert">
          <h1>Could not complete sign-in</h1>
          <p>{authError.message}</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    const query = new URLSearchParams(window.location.search);
    const hasInvitation = Boolean(query.get("invitation") && query.get("organization"));

    return (
      <main className="app-shell">
        <header className="site-header">
          <a className="brand" href="/" aria-label="Authorization demo home">
            <span className="brand-mark">A</span>
            <span>Auth0 authorization demo</span>
          </a>
        </header>

        <div className="welcome-layout">
          <section className="welcome-card">
            <p className="eyebrow">Hands-on Auth0 demo</p>
            <h1>{hasInvitation ? "Join your organization." : "See how API authorization works."}</h1>
            <p>
              {hasInvitation
                ? "Continue to Auth0 to accept your organization invitation. After signing in, you can explore the authorization demo."
                : "Sign in to try real API permission checks and see when the backend uses its separate M2M access to Auth0."}
            </p>
            <button className="button button-primary" onClick={handleLogin}>
              {hasInvitation ? "Accept invitation" : "Sign in and explore"}
            </button>
          </section>

          <aside className="welcome-brief" aria-labelledby="welcome-brief-title">
            <p className="eyebrow">What you will see</p>
            <h2 id="welcome-brief-title">Two authorization layers</h2>
            <ol className="welcome-steps">
              <li>
                <strong>User access token → application API</strong>
                <span>
                  Try user and admin endpoints. The API checks the permission
                  in the signed-in user&apos;s token.
                </span>
              </li>
              <li>
                <strong>Backend M2M token → Auth0 Management API</strong>
                <span>
                  Profile and Organization operations first authorize the user,
                  then use a separate backend-only M2M scope.
                </span>
              </li>
            </ol>
            <p className="welcome-note">
              A regular User can try profile access. Admin scenarios require
              the Admin permissions and Organization membership. A 403 can be
              an expected demonstration of a missing permission.
            </p>
          </aside>
        </div>
      </main>
    );
  }

  const organization = claims?.org_id || user.org_id;
  let currentPageTitle = "Authorization demo";
  if (currentPage === "profile") {
    currentPageTitle = "My profile";
  } else if (currentPage === "users") {
    currentPageTitle = "User administration";
  }

  // Choose which page component to show. The backend remains responsible
  // for protecting the data used by each page.
  let pageContent = (
    <ProfilePage
      apiRequest={apiRequest}
      claimsError={claimsError}
      customClaims={customClaims}
      organization={organization}
      user={user}
    />
  );
  if (currentPage === "authorization") {
    pageContent = <AuthorizationDemoPage apiRequest={apiRequest} />;
  } else if (currentPage === "users" && canManageUsers) {
    pageContent = <AdminUsersPage apiRequest={apiRequest} />;
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Authorization demo home">
          <span className="brand-mark">A</span>
          <span>Auth0 authorization demo</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            aria-current={currentPage === "authorization" ? "page" : undefined}
            className={`nav-button ${currentPage === "authorization" ? "is-current" : ""}`}
            onClick={() => setCurrentPage("authorization")}
            type="button"
          >
            Authorization demo
          </button>
          <button
            aria-current={currentPage === "profile" ? "page" : undefined}
            className={`nav-button ${currentPage === "profile" ? "is-current" : ""}`}
            onClick={() => setCurrentPage("profile")}
            type="button"
          >
            My profile
          </button>
          {canManageUsers && (
            <button
              aria-current={currentPage === "users" ? "page" : undefined}
              className={`nav-button ${currentPage === "users" ? "is-current" : ""}`}
              onClick={() => setCurrentPage("users")}
              type="button"
            >
              User administration
            </button>
          )}
        </nav>
        <div className="header-account">
          <span className="header-user">{user.name || user.email}</span>
          <button
            className="button button-secondary"
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="page-content" aria-label={currentPageTitle}>
        {adminAccessError && (
          <p className="message message-error" role="alert">
            Could not check your admin access: {adminAccessError}
          </p>
        )}
        {pageContent}
      </main>
    </div>
  );
}

export default App;

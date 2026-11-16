import React, { useState } from "react";

// These endpoints return fictional data after the API authorizes the user.
const apiChecks = [
  {
    id: "protected",
    title: "GET /api/protected",
    permission: "read:protected",
    buttonLabel: "Call user endpoint",
    path: "/protected",
  },
  {
    id: "admin",
    title: "GET /api/admin",
    permission: "read:admin",
    buttonLabel: "Call admin endpoint",
    path: "/admin",
  },
];

// These endpoints make real, read-only calls through the backend M2M app.
const managementChecks = [
  {
    id: "profile",
    title: "GET /api/profile",
    permission: "read:profile",
    managementScopes: "read:users",
    buttonLabel: "Test profile read",
    path: "/profile",
  },
  {
    id: "members",
    title: "GET /api/users",
    permission: "read:users",
    managementScopes: "read:organization_members and read:users",
    buttonLabel: "Test organization member read",
    path: "/users?page=0&per_page=5",
  },
];

const writeFlows = [
  {
    endpoint: "PATCH /api/profile",
    permission: "update:profile",
    managementScope: "update:users",
  },
  {
    endpoint: "PATCH /api/users/:userId",
    permission: "update:users",
    managementScope: "update:users",
  },
  {
    endpoint: "POST /api/users/invitations",
    permission: "create:users",
    managementScope: "create:organization_invitations",
  },
];

function getSuccessMessage(checkId, data) {
  if (checkId === "profile") {
    return `Auth0 profile read succeeded for ${data.email || "the signed-in user"}.`;
  }
  if (checkId === "members") {
    return `Read ${data.users.length} member(s) from this Organization (${data.total} total).`;
  }
  return data.message || "The API allowed the request.";
}

function getResultLabel(result) {
  if (result.kind === "allowed") {
    return `Allowed (HTTP ${result.status})`;
  }
  if (result.kind === "denied") {
    return `Denied (HTTP ${result.status})`;
  }
  return `Request failed${result.status ? ` (HTTP ${result.status})` : ""}`;
}

function DemoCheckCard({ check, result, isPending, onRun }) {
  const responseColumns = result?.responseData?.length
    ? Object.keys(result.responseData[0])
    : [];

  return (
    <article className="demo-check-card">
      <p className="eyebrow">{check.title}</p>
      <dl className="demo-check-details">
        <div>
          <dt>User API permission</dt>
          <dd>{check.permission}</dd>
        </div>
        {check.managementScopes && (
          <div>
            <dt>Backend Management API scope</dt>
            <dd>{check.managementScopes}</dd>
          </div>
        )}
      </dl>
      <button
        className="button button-secondary"
        disabled={isPending}
        onClick={() => onRun(check)}
        type="button"
      >
        {isPending ? "Checking…" : check.buttonLabel}
      </button>
      {result && (
        <div
          className={`demo-check-result is-${result.kind}`}
          role={result.kind === "allowed" ? "status" : "alert"}
        >
          <strong>{getResultLabel(result)}</strong>
          <p>{result.message}</p>
          {result.scope && <p>Validated token scope: {result.scope}</p>}
          {result.permissions?.length > 0 && (
            <p>Validated token permissions: {result.permissions.join(", ")}</p>
          )}
          {responseColumns.length > 0 && (
            <div className="demo-api-response">
              <strong>Sample data returned by the API</strong>
              <div className="demo-api-table-wrap">
                <table className="demo-api-table">
                  <thead>
                    <tr>
                      {responseColumns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.responseData.map((item) => (
                      <tr key={item.id || item.area}>
                        {responseColumns.map((column) => (
                          <td key={column}>{String(item[column])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details>
                <summary>View the data as JSON</summary>
                <pre>{JSON.stringify(result.responseData, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function AuthorizationDemoPage({ apiRequest }) {
  const [results, setResults] = useState({});
  const [pendingCheck, setPendingCheck] = useState("");

  // Send a request to the backend and save its response for the result card.
  const runCheck = async (check) => {
    setPendingCheck(check.id);
    setResults((current) => ({ ...current, [check.id]: null }));

    try {
      const data = await apiRequest(check.path);
      setResults((current) => ({
        ...current,
        [check.id]: {
          kind: "allowed",
          status: 200,
          message: getSuccessMessage(check.id, data),
          scope: data.authorization?.scope || "",
          permissions: data.authorization?.permissions || [],
          responseData: Array.isArray(data.data) ? data.data : [],
        },
      }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [check.id]: {
          kind: error.status === 403 ? "denied" : "failed",
          status: error.status,
          message: error.message || "The API request failed.",
        },
      }));
    } finally {
      setPendingCheck("");
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Auth0 authorization lab</p>
          <h1>How access is decided</h1>
          <p className="muted-text">
            First the API checks the signed-in user&apos;s access token. For
            Management API operations, the backend then uses its own M2M
            credentials and narrowly scoped token.
          </p>
        </div>
      </div>

      <section className="panel demo-section">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Layer 1</p>
            <h2>User access token → your API</h2>
          </div>
        </div>
        <p className="muted-text">
          These endpoints validate the user&apos;s access token and check the
          indicated permission. A 403 is an expected demonstration of the
          permission boundary when the token lacks that permission.
        </p>
        <div className="demo-check-grid">
          {apiChecks.map((check) => (
            <DemoCheckCard
              check={check}
              isPending={pendingCheck === check.id}
              key={check.id}
              onRun={runCheck}
              result={results[check.id]}
            />
          ))}
        </div>
        <p className="demo-footnote">
          Successful checks show only the permission and scope claims that the
          backend read after validating the token. The raw token is never shown.
        </p>
      </section>

      <section className="panel demo-section">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Layer 2</p>
            <h2>User permission → backend M2M → Auth0</h2>
          </div>
        </div>
        <ol className="request-flow-steps">
          <li className="request-flow-step">
            <span className="request-flow-number">1</span>
            <p className="eyebrow">Frontend page</p>
            <h3>User starts an action</h3>
            <p>
              The user clicks a protected API, profile, or organization
              feature.
            </p>
          </li>
          <li className="request-flow-step">
            <span className="request-flow-number">2</span>
            <p className="eyebrow">React in the browser</p>
            <h3>Sends the user&apos;s token</h3>
            <p>
              React gets an access token for this API and sends it to the
              backend as a Bearer token.
            </p>
          </li>
          <li className="request-flow-step">
            <span className="request-flow-number">3</span>
            <p className="eyebrow">Express backend</p>
            <h3>Checks access first</h3>
            <p>
              The API validates the token and required user permission. Routes
              that need it also check the Organization boundary.
            </p>
          </li>
        </ol>
        <div className="request-flow-routes">
          <article className="request-flow-route route-demo">
            <p className="eyebrow">Path A · Sample API data</p>
            <h3>
              <code>/api/protected</code> and <code>/api/admin</code>
            </h3>
            <p>
              After the user-permission check, the backend returns its demo
              data. These routes do not call the Auth0 Management API or use an
              M2M token.
            </p>
          </article>
          <article className="request-flow-route route-management">
            <p className="eyebrow">Path B · Auth0 user directory</p>
            <h3>
              <code>/api/profile</code> and <code>/api/users</code>
            </h3>
            <p>
              Only after the user-permission check succeeds, the backend gets
              or reuses a separate M2M token with the required Management API
              scope, then calls Auth0.
            </p>
          </article>
        </div>
        <p className="request-flow-return">
          Auth0 returns data to the backend, which sends the permitted result
          back to the page. The M2M token and client secret never go to the
          browser.
        </p>
        <p className="demo-footnote">
          Both checks are required for directory routes: the user&apos;s custom
          API permission and the backend app&apos;s separate Management API
          scope. For example, <code>read:users</code> can appear in both places
          but authorizes different requests.
        </p>
        <div className="demo-check-grid">
          {managementChecks.map((check) => (
            <DemoCheckCard
              check={check}
              isPending={pendingCheck === check.id}
              key={check.id}
              onRun={runCheck}
              result={results[check.id]}
            />
          ))}
        </div>
      </section>

      <section className="panel demo-section">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Write operations</p>
            <h2>Permissions and M2M scopes are separate</h2>
          </div>
        </div>
        <p className="muted-text">
          The profile and organization pages exercise these real write paths.
          A user permission authorizes a request to this API; the corresponding
          M2M scope authorizes the backend&apos;s request to Auth0.
        </p>
        <div className="demo-flow-table-wrap">
          <table className="demo-flow-table">
            <thead>
              <tr>
                <th>Backend route</th>
                <th>User API permission</th>
                <th>Backend Management API scope</th>
              </tr>
            </thead>
            <tbody>
              {writeFlows.map((flow) => (
                <tr key={flow.endpoint}>
                  <td>{flow.endpoint}</td>
                  <td>{flow.permission}</td>
                  <td>{flow.managementScope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default AuthorizationDemoPage;

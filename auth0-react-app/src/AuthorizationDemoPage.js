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
        <ol className="demo-flow">
          <li>The browser sends the user&apos;s access token to this API.</li>
          <li>The API checks the route&apos;s user permission and resource boundary.</li>
          <li>
            Only after that succeeds, the backend obtains or reuses an M2M
            token with the Management API scope needed for the operation.
          </li>
          <li>The backend calls Auth0 and returns the permitted result.</li>
        </ol>
        <p className="demo-footnote">
          The M2M token and client secret stay on the backend; they are never
          returned to the browser. Both the user permission and the backend
          Management API grant must allow an operation.
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

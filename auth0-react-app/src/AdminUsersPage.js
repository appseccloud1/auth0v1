import React, { useCallback, useEffect, useState } from "react";

function AdminUsersPage({ apiRequest }) {
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteForm, setInviteForm] = useState({
    email: "",
    displayName: "",
    phoneNumber: "",
  });
  const [isInviting, setIsInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [editingUserId, setEditingUserId] = useState("");
  const [editForm, setEditForm] = useState({ displayName: "", phoneNumber: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // The backend returns only members of the signed-in admin's Organization.
  const loadUsers = useCallback(async (requestedPage) => {
    setIsLoading(true);
    setError("");
    try {
      const result = await apiRequest(`/users?page=${requestedPage}&per_page=20`);
      setUsers(result.users);
      setTotal(result.total);
      setPage(result.page);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    loadUsers(0);
  }, [loadUsers]);

  const handleInviteChange = (event) => {
    setInviteForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  // The backend checks create:users and sends the invitation through Auth0.
  const handleInvite = async (event) => {
    event.preventDefault();
    setIsInviting(true);
    setInviteError("");
    setInviteMessage("");

    try {
      const result = await apiRequest("/users/invitations", {
        method: "POST",
        body: inviteForm,
      });
      setInviteMessage(result.message);
      setInviteForm({ email: "", displayName: "", phoneNumber: "" });
      await loadUsers(page);
    } catch (requestError) {
      setInviteError(requestError.message);
    } finally {
      setIsInviting(false);
    }
  };

  const startEditing = (user) => {
    setEditingUserId(user.id);
    setEditForm({
      displayName: user.displayName,
      phoneNumber: user.phoneNumber,
    });
  };

  // The backend checks update:users and verifies the target is in this Organization.
  const saveUser = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setSaveMessage("");

    try {
      const updatedUser = await apiRequest(`/users/${encodeURIComponent(editingUserId)}`, {
        method: "PATCH",
        body: editForm,
      });
      setUsers((current) =>
        current.map((user) => (user.id === updatedUser.id ? updatedUser : user))
      );
      setEditingUserId("");
      setSaveMessage("User profile updated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Organization users</h1>
          <p className="muted-text">
            Invite users and update profile attributes for members of your organization.
          </p>
        </div>
      </div>

      <div className="admin-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">New account</p>
              <h2>Invite a user</h2>
            </div>
          </div>
          <p className="muted-text">
            Auth0 emails an invitation. The user creates or signs into their account and joins this organization.
          </p>
          <form className="form-stack" onSubmit={handleInvite}>
            <label className="form-field">
              <span>Email address</span>
              <input
                autoComplete="email"
                name="email"
                onChange={handleInviteChange}
                required
                type="email"
                value={inviteForm.email}
              />
            </label>
            <label className="form-field">
              <span>Display name</span>
              <input
                autoComplete="name"
                maxLength="100"
                name="displayName"
                onChange={handleInviteChange}
                required
                value={inviteForm.displayName}
              />
            </label>
            <label className="form-field">
              <span>Phone number</span>
              <input
                autoComplete="tel"
                maxLength="32"
                name="phoneNumber"
                onChange={handleInviteChange}
                type="tel"
                value={inviteForm.phoneNumber}
              />
            </label>
            <button className="button button-primary" disabled={isInviting} type="submit">
              {isInviting ? "Sending invitation…" : "Send invitation"}
            </button>
            {inviteError && <p className="message message-error" role="alert">{inviteError}</p>}
            {inviteMessage && <p className="message message-success" role="status">{inviteMessage}</p>}
          </form>
        </section>

        <section className="panel users-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Current organization</p>
              <h2>Manage users</h2>
            </div>
            <button
              className="button button-secondary"
              disabled={isLoading}
              onClick={() => loadUsers(page)}
              type="button"
            >
              Refresh
            </button>
          </div>

          {isLoading && <p className="muted-text" role="status">Loading users…</p>}
          {error && <p className="message message-error" role="alert">{error}</p>}
          {saveMessage && <p className="message message-success" role="status">{saveMessage}</p>}
          {!isLoading && !error && users.length === 0 && (
            <p className="muted-text">No organization members were found.</p>
          )}

          <div className="user-list">
            {users.map((user) => (
              <article className="user-card" key={user.id}>
                {editingUserId === user.id ? (
                  <form className="form-stack" onSubmit={saveUser}>
                    <p className="user-email">{user.email}</p>
                    <label className="form-field">
                      <span>Display name</span>
                      <input
                        maxLength="100"
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            displayName: event.target.value,
                          }))
                        }
                        required
                        value={editForm.displayName}
                      />
                    </label>
                    <label className="form-field">
                      <span>Phone number</span>
                      <input
                        maxLength="32"
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            phoneNumber: event.target.value,
                          }))
                        }
                        type="tel"
                        value={editForm.phoneNumber}
                      />
                    </label>
                    <div className="button-row">
                      <button className="button button-primary" disabled={isSaving} type="submit">
                        {isSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        className="button button-secondary"
                        onClick={() => setEditingUserId("")}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="user-card-heading">
                      <div>
                        <h3>{user.displayName || "No display name"}</h3>
                        <p className="muted-text">{user.email}</p>
                      </div>
                      <button
                        className="button button-secondary"
                        onClick={() => startEditing(user)}
                        type="button"
                      >
                        Edit
                      </button>
                    </div>
                    <p className="user-phone">Phone: {user.phoneNumber || "Not provided"}</p>
                  </>
                )}
              </article>
            ))}
          </div>

          {!isLoading && total > 20 && (
            <div className="pagination">
              <button
                className="button button-secondary"
                disabled={page === 0}
                onClick={() => loadUsers(page - 1)}
                type="button"
              >
                Previous
              </button>
              <span>Page {page + 1} of {Math.ceil(total / 20)}</span>
              <button
                className="button button-secondary"
                disabled={(page + 1) * 20 >= total}
                onClick={() => loadUsers(page + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export default AdminUsersPage;

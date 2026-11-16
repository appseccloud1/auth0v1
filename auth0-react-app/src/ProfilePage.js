import React, { useEffect, useState } from "react";

function ProfilePage({
  apiRequest,
  user,
  organization,
  customClaims,
  claimsError,
}) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ displayName: "", phoneNumber: "" });
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load the signed-in user's profile from the backend when this page opens.
  useEffect(() => {
    let isCurrent = true;

    apiRequest("/profile")
      .then((data) => {
        if (isCurrent) {
          setProfile(data);
          setForm({
            displayName: data.displayName || "",
            phoneNumber: data.phoneNumber || "",
          });
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setLoadError(error.message);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [apiRequest]);

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  // Form fields are controlled by React state; submit sends that state to the API.
  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setSaveError("");
    setSaveMessage("");

    try {
      const updatedProfile = await apiRequest("/profile", {
        method: "PATCH",
        body: form,
      });
      setProfile(updatedProfile);
      setForm({
        displayName: updatedProfile.displayName || "",
        phoneNumber: updatedProfile.phoneNumber || "",
      });
      setSaveMessage("Your profile changes were saved.");
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const displayName =
    profile?.displayName || user.name || user.nickname || user.email || "Your profile";

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Your profile</h1>
          <p className="muted-text">
            View your account details and update the fields you control.
          </p>
        </div>
      </div>

      <section className="profile-hero" aria-label="Profile summary">
        {profile?.picture || user.picture ? (
          <img
            className="avatar"
            src={profile?.picture || user.picture}
            alt={`${displayName}'s avatar`}
          />
        ) : (
          <div className="avatar avatar-fallback" aria-hidden="true">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="profile-intro">
          <p className="eyebrow">Signed in as</p>
          <h2>{displayName}</h2>
          <p className="muted-text">{profile?.email || user.email || "No email address provided"}</p>
        </div>

        <span
          className={`verification-badge ${
            profile?.emailVerified ? "is-verified" : "is-unverified"
          }`}
        >
          {profile?.emailVerified ? "Email verified" : "Email not verified"}
        </span>
      </section>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Personal information</p>
              <h2>Edit your profile</h2>
            </div>
          </div>

          {isLoading && <p className="muted-text" role="status">Loading your profile…</p>}
          {loadError && <p className="message message-error" role="alert">{loadError}</p>}

          {!isLoading && !loadError && (
            <form className="form-stack" onSubmit={handleSubmit}>
              <label className="form-field">
                <span>Display name</span>
                <input
                  autoComplete="name"
                  maxLength="100"
                  name="displayName"
                  onChange={handleChange}
                  required
                  value={form.displayName}
                />
              </label>
              <label className="form-field">
                <span>Phone number</span>
                <input
                  autoComplete="tel"
                  maxLength="32"
                  name="phoneNumber"
                  onChange={handleChange}
                  type="tel"
                  value={form.phoneNumber}
                />
              </label>
              <label className="form-field">
                <span>Email address</span>
                <input readOnly value={profile?.email || ""} />
                <small>Email changes require a separate verification flow.</small>
              </label>
              <button className="button button-primary" disabled={isSaving} type="submit">
                {isSaving ? "Saving…" : "Save profile"}
              </button>
              {saveError && <p className="message message-error" role="alert">{saveError}</p>}
              {saveMessage && <p className="message message-success" role="status">{saveMessage}</p>}
            </form>
          )}

          {profile && (
            <dl className="profile-fields profile-metadata">
              <div className="profile-field">
                <dt>User ID</dt>
                <dd>{profile.id}</dd>
              </div>
              <div className="profile-field">
                <dt>Organization ID</dt>
                <dd>{organization || "Not provided"}</dd>
              </div>
            </dl>
          )}
        </section>

        <section className="panel custom-claims-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Frontend session</p>
              <h2>Additional ID-token claims</h2>
            </div>
          </div>

          <p className="muted-text">
            These claims come from the frontend ID token. API authorization uses
            the separate access token and backend permission checks.
          </p>
          {claimsError && <p className="message message-error" role="alert">{claimsError}</p>}
          {customClaims.length > 0 ? (
            <dl className="profile-fields custom-claims">
              {customClaims.map(([key, value]) => (
                <div className="profile-field" key={key}>
                  <dt>{key}</dt>
                  <dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="muted-text">
              No additional claims were returned. This section reads the ID token
              in the frontend; API authorization uses the separate access token.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

export default ProfilePage;

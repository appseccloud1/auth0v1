import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAuth0 } from "@auth0/auth0-react";
import App from "./App";

jest.mock("@auth0/auth0-react", () => ({
  useAuth0: jest.fn(),
}));

const defaultAuth = {
  error: undefined,
  getAccessTokenSilently: jest.fn().mockResolvedValue("test-access-token"),
  getIdTokenClaims: jest.fn().mockResolvedValue(null),
  isAuthenticated: false,
  isLoading: false,
  loginWithRedirect: jest.fn(),
  logout: jest.fn(),
  user: undefined,
};

const jsonResponse = (data, status = 200) => ({
  headers: { get: () => "application/json; charset=utf-8" },
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(data),
});

const profile = {
  id: "auth0|user123",
  email: "alex@example.com",
  emailVerified: true,
  displayName: "Alex Example",
  phoneNumber: "",
  picture: "",
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth0.mockReturnValue(defaultAuth);
  process.env.REACT_APP_API_URL = "http://localhost:3013";
  global.fetch = jest.fn().mockResolvedValue(jsonResponse(profile));
  window.history.replaceState({}, "", "/");
});

test("shows a sign-in prompt when the user is not authenticated", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Two authorization layers" })).toBeInTheDocument();
  expect(screen.getByText("User access token → application API")).toBeInTheDocument();
  expect(screen.getByText("Backend M2M token → Auth0 Management API")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sign in and explore" }));
  expect(defaultAuth.loginWithRedirect).toHaveBeenCalledTimes(1);
});

test("passes organization invitation parameters to Auth0", () => {
  window.history.replaceState(
    {},
    "",
    "/?invitation=invite-ticket&organization=org_123"
  );
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

  expect(defaultAuth.loginWithRedirect).toHaveBeenCalledWith({
    authorizationParams: {
      invitation: "invite-ticket",
      organization: "org_123",
    },
  });
});

test("passes an Organization query parameter to Auth0 for an organization login", () => {
  window.history.replaceState({}, "", "/?organization=org_123");
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Sign in and explore" }));

  expect(defaultAuth.loginWithRedirect).toHaveBeenCalledWith({
    authorizationParams: { organization: "org_123" },
  });
});

test("loads and updates only the signed-in user's profile fields", async () => {
  useAuth0.mockReturnValue({
    ...defaultAuth,
    isAuthenticated: true,
    user: { name: "Alex Example", email: "alex@example.com" },
  });
  global.fetch.mockImplementation((url, options) => {
    if (url.endsWith("/api/admin/access")) {
      return Promise.resolve(jsonResponse({ message: "Insufficient permission" }, 403));
    }
    if (url.endsWith("/api/profile") && options?.method === "PATCH") {
      return Promise.resolve(jsonResponse({ ...profile, displayName: "Alex Updated", phoneNumber: "555-0100" }));
    }
    return Promise.resolve(jsonResponse(profile));
  });

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "My profile" }));

  expect(await screen.findByDisplayValue("Alex Example")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "Alex Updated" },
  });
  fireEvent.change(screen.getByLabelText("Phone number"), {
    target: { value: "555-0100" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

  expect(await screen.findByText("Your profile changes were saved.")).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/profile"),
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ displayName: "Alex Updated", phoneNumber: "555-0100" }),
    })
  );
});

test("shows the upstream Management API failure stage and status", async () => {
  useAuth0.mockReturnValue({
    ...defaultAuth,
    isAuthenticated: true,
    user: { name: "Alex Example" },
  });
  global.fetch.mockImplementation((url) => {
    if (url.endsWith("/api/admin/access")) {
      return Promise.resolve(jsonResponse({ message: "Insufficient permission" }, 403));
    }
    return Promise.resolve(
      jsonResponse(
        {
          message: "The Auth0 user directory request failed.",
          upstreamStage: "token",
          upstreamStatus: 400,
        },
        502
      )
    );
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Test profile read" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The Auth0 user directory request failed. (token, HTTP 400)"
  );
});

test("shows user administration only after the backend grants access and supports invitations", async () => {
  useAuth0.mockReturnValue({
    ...defaultAuth,
    isAuthenticated: true,
    user: { name: "Admin Example", email: "admin@example.com" },
  });
  global.fetch.mockImplementation((url, options) => {
    if (url.endsWith("/api/admin/access")) {
      return Promise.resolve(jsonResponse({ allowed: true }));
    }
    if (url.includes("/api/users/invitations")) {
      return Promise.resolve(jsonResponse({ message: "Invitation email sent." }, 201));
    }
    if (url.includes("/api/users/") && options?.method === "PATCH") {
      return Promise.resolve(
        jsonResponse({
          id: "auth0|member1",
          email: "member@example.com",
          displayName: "Updated Member",
          phoneNumber: "555-0123",
        })
      );
    }
    if (url.includes("/api/users")) {
      return Promise.resolve(
        jsonResponse({
          users: [
            {
              id: "auth0|member1",
              email: "member@example.com",
              displayName: "Member One",
              phoneNumber: "",
            },
          ],
          page: 0,
          perPage: 20,
          total: 1,
        })
      );
    }
    return Promise.resolve(jsonResponse(profile));
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "User administration" }));
  expect(await screen.findByText("Member One")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "new@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "New User" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));

  expect(await screen.findByText("Invitation email sent.")).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/users/invitations"),
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        email: "new@example.com",
        displayName: "New User",
        phoneNumber: "",
      }),
    })
  );

  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getAllByLabelText("Display name")[1], {
    target: { value: "Updated Member" },
  });
  fireEvent.change(screen.getAllByLabelText("Phone number")[1], {
    target: { value: "555-0123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/users/auth0%7Cmember1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          displayName: "Updated Member",
          phoneNumber: "555-0123",
        }),
      })
    );
  });
});

test("shows a permission denial from the protected API", async () => {
  useAuth0.mockReturnValue({
    ...defaultAuth,
    isAuthenticated: true,
    user: { name: "Alex Example" },
  });
  global.fetch.mockImplementation((url) => {
    if (url.endsWith("/api/admin/access")) {
      return Promise.resolve(jsonResponse({ message: "Insufficient permission" }, 403));
    }
    if (url.endsWith("/api/admin")) {
      return Promise.resolve(jsonResponse({ message: "Insufficient permission" }, 403));
    }
    return Promise.resolve(jsonResponse(profile));
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Call admin endpoint" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Insufficient permission");
});

test("shows validated access-token permission claims in the authorization demo", async () => {
  useAuth0.mockReturnValue({
    ...defaultAuth,
    isAuthenticated: true,
    user: { name: "Alex Example" },
  });
  global.fetch.mockImplementation((url) => {
    if (url.endsWith("/api/admin/access")) {
      return Promise.resolve(jsonResponse({ message: "Insufficient permission" }, 403));
    }
    if (url.endsWith("/api/protected")) {
      return Promise.resolve(
        jsonResponse({
          message: "Sample project data returned by the protected API.",
          data: [
            {
              id: "project-101",
              name: "Customer portal",
              status: "In progress",
            },
          ],
          authorization: {
            permissions: ["read:protected"],
            scope: "read:protected",
          },
        })
      );
    }
    return Promise.resolve(jsonResponse(profile));
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Call user endpoint" }));

  expect(
    await screen.findByText("Sample project data returned by the protected API.")
  ).toBeInTheDocument();
  expect(screen.getByText("Validated token scope: read:protected")).toBeInTheDocument();
  expect(screen.getByText("Customer portal")).toBeInTheDocument();
  expect(screen.getByText("View the data as JSON")).toBeInTheDocument();
});

test("demonstrates a user permission followed by a backend Management API read", async () => {
  useAuth0.mockReturnValue({
    ...defaultAuth,
    getAccessTokenSilently: jest.fn().mockResolvedValue("test-access-token"),
    isAuthenticated: true,
    user: { name: "Alex Example" },
  });
  global.fetch.mockImplementation((url) => {
    if (url.endsWith("/api/admin/access")) {
      return Promise.resolve(jsonResponse({ message: "Insufficient permission" }, 403));
    }
    if (url.endsWith("/api/profile")) {
      return Promise.resolve(jsonResponse({ email: "alex@example.com" }));
    }
    return Promise.resolve(jsonResponse(profile));
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Test profile read" }));

  expect(
    await screen.findByText("Auth0 profile read succeeded for alex@example.com.")
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/profile"),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: "Bearer test-access-token",
      }),
    })
  );
});

test("explains when the API responds with HTML instead of JSON", async () => {
  useAuth0.mockReturnValue({
    ...defaultAuth,
    isAuthenticated: true,
    user: { name: "Alex Example" },
  });
  global.fetch.mockImplementation((url) => {
    if (url.endsWith("/api/admin/access")) {
      return Promise.resolve(jsonResponse({ message: "Insufficient permission" }, 403));
    }
    if (url.endsWith("/api/protected")) {
      return Promise.resolve({
        headers: { get: () => "text/html" },
        ok: false,
        status: 401,
      });
    }
    return Promise.resolve(jsonResponse(profile));
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Call user endpoint" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The API returned a non-JSON response (HTTP 401)"
  );
});

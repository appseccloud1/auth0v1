import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { Auth0Provider } from "@auth0/auth0-react";

reportWebVitals();

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  // Auth0Provider makes sign-in and token methods available to the React app.
  <Auth0Provider
    domain={process.env.REACT_APP_AUTH0_DOMAIN}
    clientId={process.env.REACT_APP_AUTH0_CLIENT_ID}
    authorizationParams={{
      redirect_uri: window.location.origin,
      audience: process.env.REACT_APP_AUTH0_AUDIENCE,
      // These permissions are requested for this API; Auth0 grants only what
      // the signed-in user is authorized to receive.
      scope:
        "openid profile email read:protected read:admin read:profile update:profile read:users create:users update:users",
    }}
  >
    <App />
  </Auth0Provider>
);
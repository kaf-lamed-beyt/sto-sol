"use client";
import { useAuthenticator, Authenticator } from "@storacha/ui-react";

export const Login = () => {
  const [{ email, submitted }, { setEmail, cancelLogin }] = useAuthenticator();
  return (
    <Authenticator.Form>
      {submitted ? (
        <>
          <p>
            a verification is in your <b>{email}</b>. Click the link to log in.
          </p>
          <button onClick={cancelLogin}>Cancel</button>
        </>
      ) : (
        <>
          <label htmlFor="email">Email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </>
      )}
    </Authenticator.Form>
  );
};

import { useState } from "react";
import { $api } from "./api/client";

export const AuthForm = (props: { onSignedIn: (token: string) => void }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const signUp = $api.useMutation("post", "/auth/sign-up");
  const signIn = $api.useMutation("post", "/auth/sign-in");

  const doSignIn = () =>
    signIn.mutate(
      {
        body: {
          identifier: { scheme: "username", value: username },
          credential: { scheme: "basic", value: password },
        },
      },
      { onSuccess: ({ token }) => props.onSignedIn(token) },
    );

  // A new account signs straight in.
  const doSignUp = () =>
    signUp.mutate({ body: { username, credential: password } }, { onSuccess: doSignIn });

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <p>Username and password: at least 8 characters each.</p>
      <input
        placeholder="username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
      />
      <input
        type="password"
        placeholder="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <button onClick={doSignIn}>Sign in</button>
      <button onClick={doSignUp}>Sign up</button>
      {(signUp.isError || signIn.isError) && (
        <p role="alert">Request failed - see the network tab.</p>
      )}
    </form>
  );
};

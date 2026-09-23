import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { tokenStore } from "./api/client";
import { AuthForm } from "./auth-form";
import { Configurations } from "./configurations";

export const App = () => {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(tokenStore.get());

  const onSignedIn = (value: string) => {
    tokenStore.set(value);
    setToken(value);
  };

  const signOut = () => {
    tokenStore.clear();
    setToken(null);
    queryClient.clear();
  };

  return (
    <main>
      <h1>IGNIS RPC client</h1>
      {token ? (
        <>
          <button onClick={signOut}>Sign out</button>
          <Configurations />
        </>
      ) : (
        <AuthForm onSignedIn={onSignedIn} />
      )}
      <p>
        The server also renders HTML: <a href="/api">its JSX home page</a>.
      </p>
    </main>
  );
};

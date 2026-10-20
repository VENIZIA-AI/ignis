import { useState } from "react";
import { $api } from "./api/client";

export const Configurations = () => {
  const [code, setCode] = useState("");
  const [group, setGroup] = useState("");

  const me = $api.useQuery("get", "/auth/who-am-i");
  const list = $api.useQuery("get", "/configurations");
  const refetchListOnSuccess = { onSuccess: () => list.refetch() };
  const create = $api.useMutation("post", "/configurations", refetchListOnSuccess);
  const remove = $api.useMutation("delete", "/configurations/{id}", refetchListOnSuccess);

  // A list answers `{ count, data }`, or the bare array when the request sends `x-request-count: false`.
  const rows = Array.isArray(list.data) ? list.data : (list.data?.data ?? []);
  const isError = list.isError || create.isError || remove.isError;

  return (
    <section>
      <p>Signed in as {me.data?.userId}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ body: { code, group } });
        }}
      >
        <input placeholder="code" value={code} onChange={(event) => setCode(event.target.value)} />
        <input
          placeholder="group"
          value={group}
          onChange={(event) => setGroup(event.target.value)}
        />
        <button type="submit">Add</button>
      </form>
      {isError && <p role="alert">Request failed - see the network tab.</p>}
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            {row.code} ({row.group}){" "}
            <button onClick={() => remove.mutate({ params: { path: { id: row.id } } })}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

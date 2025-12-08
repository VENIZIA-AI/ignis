export type FormState = {
  status: "idle" | "pending" | "success" | "error";
  message?: string;
};

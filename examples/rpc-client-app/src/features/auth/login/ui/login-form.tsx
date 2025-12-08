import { useActionState } from "react";
import { Form, Input, Button, Alert, Card, Typography } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useLogin } from "../api";
import type { FormState } from "@/features/auth";
import type { LoginCredential } from "@/features/auth/login/model";

const { Title } = Typography;

/**
 * Login form component
 * Handles user authentication with username and password
 * Redirects to home page on successful login
 */
export function LoginForm() {
  const loginMutation = useLogin();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const loginAction = async (
    _prevState: FormState,
    formData: FormData,
  ): Promise<FormState> => {
    const identifier = formData.get("username") as unknown as LoginCredential;
    const credential = formData.get("credential") as unknown as LoginCredential;

    try {
      await loginMutation.mutateAsync({
        body: { identifier, credential },
      });
      form.resetFields();

      navigate("/");

      return { status: "success", message: "Login successful!" };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Login failed. Please try again.";

      return {
        status: "error",
        message: errorMessage,
      };
    }
  };

  const [state, formAction, isPending] = useActionState(loginAction, {
    status: "idle",
  });

  return (
    <div style={{ maxWidth: "400px", margin: "2rem auto" }}>
      <Card>
        <Title
          level={2}
          style={{ textAlign: "center", marginBottom: "1.5rem" }}
        >
          Login
        </Title>

        <Form
          form={form}
          name="login"
          onFinish={(values) => {
            const formData = new FormData();
            formData.append("username", values.username);
            formData.append("credential", values.credential);
            formAction(formData);
          }}
          autoComplete="off"
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="identifier"
            label="Username"
            rules={[{ required: true, message: "Please input your username!" }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Enter username"
              disabled={isPending}
            />
          </Form.Item>

          <Form.Item
            name="credential"
            label="Password"
            rules={[{ required: true, message: "Please input your password!" }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Enter password"
              disabled={isPending}
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={isPending} block>
              {isPending ? "Logging in..." : "Login"}
            </Button>
          </Form.Item>

          {state.status === "error" && state.message && (
            <Form.Item>
              <Alert
                title="Error"
                description={state.message}
                type="error"
                showIcon
                closable
              />
            </Form.Item>
          )}

          {state.status === "success" && state.message && (
            <Form.Item>
              <Alert
                title="Success"
                description={state.message}
                type="success"
                showIcon
                closable
              />
            </Form.Item>
          )}
        </Form>
      </Card>
    </div>
  );
}

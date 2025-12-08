import { useActionState } from "react";
import { Form, Input, Button, Alert, Card, Typography } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { type FormState, useSignUp } from "@/features/auth";

const { Title } = Typography;

export function SignUpForm() {
  const signUpMutation = useSignUp();
  const [form] = Form.useForm();

  const signUpAction = async (
    _prevState: FormState,
    formData: FormData,
  ): Promise<FormState> => {
    const username = formData.get("username") as string;
    const credential = formData.get("credential") as string;

    try {
      await signUpMutation.mutateAsync({
        body: { username, credential },
      });
      form.resetFields();
      return { status: "success", message: "Sign up successful!" };
    } catch (error: unknown) {
      return {
        status: "error",
        message: (error as string) || "Sign up failed. Please try again.",
      };
    }
  };

  const [state, formAction, isPending] = useActionState(signUpAction, {
    status: "idle",
  });

  return (
    <div style={{ maxWidth: "400px", margin: "2rem auto" }}>
      <Card>
        <Title
          level={2}
          style={{ textAlign: "center", marginBottom: "1.5rem" }}
        >
          Sign Up
        </Title>

        <Form
          form={form}
          name="signup"
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
            name="username"
            label="Username"
            rules={[
              { required: true, message: "Please input your username!" },
              { min: 3, message: "Username must be at least 3 characters!" },
            ]}
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
            rules={[
              { required: true, message: "Please input your password!" },
              { min: 6, message: "Password must be at least 6 characters!" },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Enter password"
              disabled={isPending}
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={isPending} block>
              {isPending ? "Signing up..." : "Sign Up"}
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

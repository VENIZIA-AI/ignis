import { Typography, Card, Row, Col, Space, Divider } from "antd";
import {
  ThunderboltOutlined,
  SafetyOutlined,
  ApiOutlined,
  RocketOutlined,
  CodeOutlined,
} from "@ant-design/icons";

const { Title, Paragraph, Text } = Typography;

/**
 * Home page component
 * Displays introduction to Ignis framework with SSR and type-safe API features
 */
export function HomePage() {
  const features = [
    {
      icon: (
        <ThunderboltOutlined style={{ fontSize: "32px", color: "#1890ff" }} />
      ),
      title: "Server-Side Rendering",
      description:
        "Built-in SSR support with Hono for blazing-fast initial page loads and SEO-friendly content delivery.",
    },
    {
      icon: <SafetyOutlined style={{ fontSize: "32px", color: "#52c41a" }} />,
      title: "Type-Safe APIs",
      description:
        "End-to-end type safety with OpenAPI TypeScript code generation. Catch errors at compile time, not runtime.",
    },
    {
      icon: <ApiOutlined style={{ fontSize: "32px", color: "#722ed1" }} />,
      title: "OpenAPI Integration",
      description:
        "Automatic API documentation and client generation from your schema. Keep docs and code in sync effortlessly.",
    },
    {
      icon: <RocketOutlined style={{ fontSize: "32px", color: "#fa8c16" }} />,
      title: "Modern Stack",
      description:
        "React 19, Ant Design 6, TanStack Query, and Vite for the best developer experience and performance.",
    },
  ];

  return (
    <Space orientation="vertical" size="large" style={{ width: "100%" }}>
      {/* Hero Section */}
      <div style={{ textAlign: "center", padding: "40px 0 20px" }}>
        <Title level={1} style={{ marginBottom: "16px" }}>
          Welcome to Ignis RPC Client
        </Title>
        <Paragraph
          style={{
            fontSize: "18px",
            maxWidth: "700px",
            margin: "0 auto",
            color: "rgba(0, 0, 0, 0.65)",
          }}
        >
          A full-stack TypeScript framework demonstrating{" "}
          <Text strong>server-side rendering</Text>,{" "}
          <Text strong>type-safe OpenAPI integration</Text>, and modern React
          patterns. Build scalable backends with confidence.
        </Paragraph>
      </div>

      {/* Features Grid */}
      <Row gutter={[24, 24]}>
        {features.map((feature, index) => (
          <Col xs={24} sm={12} key={index}>
            <Card hoverable style={{ height: "100%" }}>
              <Space
                orientation="vertical"
                size="middle"
                style={{ width: "100%" }}
              >
                {feature.icon}
                <Title level={4} style={{ margin: 0 }}>
                  {feature.title}
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>
                  {feature.description}
                </Paragraph>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Divider />

      {/* Type-Safe Example */}
      <Card>
        <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
          <Title level={3}>
            <CodeOutlined /> Type-Safe OpenAPI Client Example
          </Title>
          <Paragraph>
            This demo showcases type inference from OpenAPI schemas. The client
            automatically knows about all available endpoints, request/response
            types, and HTTP methods:
          </Paragraph>
          <pre
            style={{
              background: "#f5f5f5",
              padding: "16px",
              borderRadius: "4px",
              overflow: "auto",
            }}
          >
            {`// API hook with full type inference
export function useAboutQuery() {
  return $api.useQuery("get", "/about", {
    parseAs: "text", // Auto-complete available
  });
}

// Type-safe mutation with auto-complete
export function useSignUp() {
  return $api.useMutation("post", "/auth/sign-up");
  // TypeScript knows the body shape: { username: string, credential: string }
}`}
          </pre>
          <Paragraph type="secondary">
            Try navigating to the <Text strong>About</Text> page to see
            server-side data fetching in action, or check out the{" "}
            <Text strong>Sign Up</Text> form to experience type-safe mutations
            with React Query.
          </Paragraph>
        </Space>
      </Card>
    </Space>
  );
}

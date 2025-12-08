import { Layout, Typography, Space } from "antd";
import { GithubOutlined } from "@ant-design/icons";
import { Link as RouterLink } from "react-router-dom";

const { Footer } = Layout;
const { Text, Link } = Typography;

/**
 * Application footer component
 * Displays copyright and links
 */
export function AppFooter() {
  return (
    <Footer style={{ textAlign: "center", marginTop: "auto" }}>
      <Space direction="vertical" size="small">
        <Text type="secondary">
          Ignis Framework ©{new Date().getFullYear()} - Type-safe backend for
          TypeScript
        </Text>
        <Space split="|">
          <Link
            href="https://github.com/your-org/ignis"
            target="_blank"
            rel="noopener noreferrer"
            title="View source code on GitHub"
          >
            <GithubOutlined /> GitHub
          </Link>
          <RouterLink to="/about">
            <Link>About</Link>
          </RouterLink>
        </Space>
      </Space>
    </Footer>
  );
}

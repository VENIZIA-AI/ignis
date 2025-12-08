import { Menu, Typography } from "antd";
import type { MenuProps } from "antd";
import {
  ThunderboltOutlined,
  ApiOutlined,
  BookOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

type MenuItem = Required<MenuProps>["items"][number];

const items: MenuItem[] = [
  {
    key: "features-header",
    label: (
      <Text type="secondary" style={{ fontSize: "12px", fontWeight: "bold" }}>
        DEMO FEATURES
      </Text>
    ),
    type: "group",
  },
  {
    key: "ssr",
    icon: <ThunderboltOutlined />,
    label: "Server-Side Rendering",
    disabled: true,
    title: "Demonstrated in About page",
  },
  {
    key: "typesafe",
    icon: <ApiOutlined />,
    label: "Type-Safe APIs",
    disabled: true,
    title: "Auto-generated from OpenAPI",
  },
  {
    key: "openapi",
    icon: <BookOutlined />,
    label: "OpenAPI Integration",
    disabled: true,
    title: "Full type inference",
  },
  {
    key: "divider",
    type: "divider",
  },
  {
    key: "info",
    label: (
      <Text type="secondary" style={{ fontSize: "11px", fontStyle: "italic" }}>
        Navigate using the header menu above
      </Text>
    ),
    disabled: true,
  },
];

/**
 * Application sidebar component
 * Displays informational menu about demo features
 */
export function AppSidebar() {
  return (
    <Menu
      mode="inline"
      items={items}
      style={{
        height: "100%",
        borderRight: 0,
        paddingTop: "16px",
      }}
      selectable={false}
    />
  );
}

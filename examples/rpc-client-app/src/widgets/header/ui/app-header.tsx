import { Layout, Menu, Avatar, Dropdown, Space, Typography } from "antd";
import type { MenuProps } from "antd";
import { Link, useLocation } from "react-router-dom";
import { UserOutlined, LogoutOutlined } from "@ant-design/icons";
import { ROUTES } from "@/shared/config/routes";

const { Header } = Layout;
const { Text } = Typography;

/**
 * Application header component
 * Contains logo, app name, navigation links, and user profile
 */
export function AppHeader() {
  const location = useLocation();

  // Determine an active menu key based on the current route
  const getActiveKey = (): string => {
    const routeEntry = Object.entries(ROUTES).find(
      ([, config]) => config.path === location.pathname,
    );
    return routeEntry?.[0] ?? "";
  };

  // Build navigation menu items from routes configuration
  const navMenuItems: MenuProps["items"] = Object.entries(ROUTES).map(
    ([key, config]) => ({
      key,
      icon: <config.icon />,
      label: <Link to={config.path}>{config.label}</Link>,
    }),
  );

  const userMenuItems: MenuProps["items"] = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "Profile",
      disabled: true, // Disabled until auth is implemented
    },
    {
      type: "divider",
    },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Logout",
      danger: true,
      disabled: true, // Disabled until auth is implemented
      onClick: () => {
        console.log("[AppHeader] Logout clicked - auth not implemented yet");
      },
    },
  ];

  return (
    <Header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 1,
        width: "100%",
      }}
    >
      <Space size="large" style={{ flex: 1 }}>
        <Text
          strong
          style={{
            color: "white",
            fontSize: "20px",
            whiteSpace: "nowrap",
          }}
        >
          🔥 Ignis RPC
        </Text>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[getActiveKey()]}
          items={navMenuItems}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            background: "transparent",
          }}
        />
      </Space>
      <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
        <Avatar
          icon={<UserOutlined />}
          style={{ cursor: "pointer", backgroundColor: "#1890ff" }}
        />
      </Dropdown>
    </Header>
  );
}

import { useState } from "react";
import { Layout } from "antd";
import { Outlet } from "react-router-dom";
import { AppHeader } from "@/widgets/header";
import { AppSidebar } from "@/widgets/sidebar";
import { AppFooter } from "@/widgets/footer";

const { Content, Sider } = Layout;

/**
 * Main application layout component
 * Implements Holy Grail layout with header, sidebar, content, and footer
 */
export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <AppHeader />
      <Layout>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={250}
          theme="light"
          style={{
            overflow: "auto",
            height: "calc(100vh - 64px)",
            position: "sticky",
            top: 64,
            left: 0,
          }}
        >
          <AppSidebar />
        </Sider>
        <Layout style={{ padding: "24px" }}>
          <Content
            style={{
              padding: 24,
              margin: 0,
              minHeight: 280,
              background: "#fff",
              borderRadius: 8,
            }}
          >
            <Outlet />
          </Content>
          <AppFooter />
        </Layout>
      </Layout>
    </Layout>
  );
}

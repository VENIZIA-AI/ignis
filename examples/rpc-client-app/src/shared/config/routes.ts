import {
  HomeOutlined,
  InfoCircleOutlined,
  UserAddOutlined,
  LoginOutlined,
} from "@ant-design/icons";

/**
 * Application route configuration
 * Centralized definition of all routes for navigation and routing
 */
export const ROUTES = {
  home: {
    path: "/",
    label: "Home",
    icon: HomeOutlined,
  },
  about: {
    path: "/about",
    label: "About",
    icon: InfoCircleOutlined,
  },
  signup: {
    path: "/sign-up",
    label: "Sign Up",
    icon: UserAddOutlined,
  },
  login: {
    path: "/login",
    label: "Login",
    icon: LoginOutlined,
  },
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey]["path"];

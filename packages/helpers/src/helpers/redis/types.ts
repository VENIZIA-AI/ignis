import { ClusterOptions } from "ioredis";
import { DefaultRedisHelper } from "./default.helper";

// -----------------------------------------------------------------------------------------------
export interface IRedisHelperProps {
  name: string;
  host: string;
  port: string | number;
  user?: string;
  password: string;
  database?: number;
  autoConnect?: boolean;
  maxRetry?: number;
}

export interface IRedisClusterHelperProps {
  name: string;
  nodes: Array<Pick<IRedisHelperProps, "host" | "port"> & { password?: string }>;
  clusterOptions?: ClusterOptions;
}

export interface IRedisHelperCallbacks {
  onInitialized?: (opts: { name: string; helper: DefaultRedisHelper }) => void;
  onConnected?: (opts: { name: string; helper: DefaultRedisHelper }) => void;
  onReady?: (opts: { name: string; helper: DefaultRedisHelper }) => void;
  onError?: (opts: { name: string; helper: DefaultRedisHelper; error: any }) => void;
}

export interface IRedisHelperOptions extends IRedisHelperProps, IRedisHelperCallbacks {}
export interface IRedisClusterHelperOptions
  extends IRedisClusterHelperProps, IRedisHelperCallbacks {}

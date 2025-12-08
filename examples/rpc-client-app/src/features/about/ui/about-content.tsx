import { sanitizeHtml } from "@/shared/lib";
import { useAboutQuery } from "@/features/about";
import { Spin } from "antd";

export function AboutContent() {
  const { data, isLoading } = useAboutQuery();

  if (isLoading || !data) {
    return <Spin size="large"></Spin>;
  }

  const sanitizedHtml = sanitizeHtml(data as string);

  return <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
}

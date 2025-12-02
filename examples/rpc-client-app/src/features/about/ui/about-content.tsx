import { sanitizeHtml } from '@/shared/lib';
import { useAboutQuery } from '../api';

export function AboutContent() {
  const { data, isLoading } = useAboutQuery();

  if (isLoading || !data) {
    return <p style={{ color: 'green', marginTop: '1rem' }}>Loading...</p>;
  }

  const sanitizedHtml = sanitizeHtml(data as string);

  return <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
}

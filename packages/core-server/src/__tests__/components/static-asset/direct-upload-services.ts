import type { TStaticAssetEntry } from '@/components/static-asset/common';
import type { TMetaLinkCompatibleSchema } from '@/components/static-asset/models';
import { StaticAssetEntryUtility } from '@/components/static-asset/utilities/entry.utility';

/** What the component does for an entry: builds the pair the controller runs. A test that calls `StaticAssetControllerFactory.build` directly passes the result in. */
export const buildDirectUploadServices = <Schema extends TMetaLinkCompatibleSchema>(opts: {
  key: string;
  entry: TStaticAssetEntry<Schema>;
}) => {
  const resolved = StaticAssetEntryUtility.resolve(opts);

  return StaticAssetEntryUtility.buildDirectUploadServices({ resolved }) ?? {};
};

import { Route } from "react-router";
import { lazy } from "react";
const Page = lazy(() => import("./Page"));
const Center = lazy(() => import("./Center")); const NewAsset = lazy(() => import("./NewAsset")); const AssetDetail = lazy(() => import("./Detail")); const VersionDetail = lazy(() => import("./VersionDetail"));
export const routes = <><Route path="assets" element={<Center />} /><Route path="assets/mine" element={<Center mine />} /><Route path="assets/new" element={<NewAsset />} /><Route path="assets/:assetId" element={<AssetDetail />} /><Route path="assets/:assetId/versions/new" element={<Page title="版本编辑器" />} /><Route path="assets/:assetId/versions/:versionId" element={<VersionDetail />} />
  {/* WP9h owns the archive editor; the tarball endpoint remains available there. */}
</>;

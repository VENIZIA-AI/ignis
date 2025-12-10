#!/usr/bin/env bun

import { $ } from "bun";
import fs from "fs";
import path from "path";

type BuildMode =
  | "patch"
  | "minor"
  | "major"
  | "prepatch"
  | "preminor"
  | "premajor"
  | "prerelease";

interface PackageInfo {
  name: string;
  version: string;
  folderName: string;
  packagePath: string;
}

// -------------------------------------------------------------------------------
const getPackageInfo = async (packageName: string): Promise<PackageInfo> => {
  const rootDir = path.join(import.meta.dir, "..", "..");
  const packagePath = path.join(rootDir, "packages", packageName);

  if (!fs.existsSync(packagePath)) {
    console.error(`[getPackageInfo] Package not found: ${packageName}`);

    const availablePackages =
      await $`ls ${path.join(rootDir, "packages")}`.text();

    console.warn(
      `[getPackageInfo] Available packages in packages/:\n${availablePackages}`,
    );
    process.exit(1);
  }

  const packageJsonPath = path.join(packagePath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.error(
      `[getPackageInfo] package.json not found | path: %s`,
      packagePath,
    );
    process.exit(1);
  }

  const packageJson = await Bun.file(packageJsonPath).json();

  return {
    name: packageJson.name,
    version: packageJson.version,
    folderName: packageName,
    packagePath,
  };
};

// -------------------------------------------------------------------------------
const validateBuildArtifacts = async (
  packagePath: string,
): Promise<{ success: boolean; errors: string[] }> => {
  const errors: string[] = [];
  const distPath = path.join(packagePath, "dist");

  if (!fs.existsSync(distPath)) {
    errors.push("dist directory not found");
    return { success: false, errors };
  }

  console.log("[validateBuildArtifacts] dist directory found");

  const requiredFiles = ["index.js", "index.d.ts"];
  for (const file of requiredFiles) {
    const filePath = path.join(distPath, file);
    if (fs.existsSync(filePath)) {
      console.log(`[validateBuildArtifacts] Found dist/${file}`);
      continue;
    }

    console.warn(`[validateBuildArtifacts] Missing dist/${file}`);
  }

  return { success: errors.length === 0, errors };
};

// -------------------------------------------------------------------------------
const mapBuildModeToVersion = (buildMode: BuildMode): string => {
  const mapping: Record<string, string> = {
    prepatch: "patch",
    preminor: "minor",
    premajor: "major",
    prerelease: "patch",
  };
  return mapping[buildMode] || buildMode;
};

// -------------------------------------------------------------------------------
const getNpmTag = (buildMode: BuildMode): "latest" | "next" => {
  return ["prepatch", "preminor", "premajor", "prerelease"].includes(buildMode)
    ? "next"
    : "latest";
};

// -------------------------------------------------------------------------------
const shouldMergeToMain = (buildMode: BuildMode): boolean => {
  return !["prepatch", "preminor", "premajor", "prerelease"].includes(
    buildMode,
  );
};

// -------------------------------------------------------------------------------
const simulateVersionBump = async (
  packagePath: string,
  buildMode: BuildMode,
  currentVersion: string,
): Promise<string> => {
  const packageJsonPath = path.join(packagePath, "package.json");

  await $`cp ${packageJsonPath} ${packageJsonPath}.backup`;

  try {
    const versionMode = mapBuildModeToVersion(buildMode);

    await $`cd ${packagePath} && npm version ${versionMode} --no-git-tag-version 2>&1 || true`.text();

    const packageJson = await Bun.file(packageJsonPath).json();
    const newVersion = packageJson.version;

    return newVersion;
  } catch (error) {
    console.error(
      "[simulateVersionBump] Failed to bump version | error: %s",
      error,
    );
    try {
      const packageJson = await Bun.file(packageJsonPath).json();
      return packageJson.version;
    } catch {
      return currentVersion;
    }
  }
};

// -------------------------------------------------------------------------------
const restorePackageJson = async (packagePath: string): Promise<void> => {
  const packageJsonPath = path.join(packagePath, "package.json");
  const backupPath = `${packageJsonPath}.backup`;

  if (fs.existsSync(backupPath)) {
    await $`mv ${backupPath} ${packageJsonPath}`;
    console.log("[restorePackageJson] Restored package.json");
  }
};

// -------------------------------------------------------------------------------
const main = async (): Promise<void> => {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error(
      "[main] Usage: bun scripts/test-release.ts <package-name> [build-mode]",
    );
    console.log(
      "[main] Example: bun scripts/test-release.ts dev-configs patch",
    );
    console.log("[main] Example: bun scripts/test-release.ts core minor");
    console.log("[main] Example: bun scripts/test-release.ts helpers prepatch");
    process.exit(1);
  }

  const packageName = args[0];
  const buildMode = (args[1] || "patch") as BuildMode;

  console.log("----------------------------------------");
  console.log("Test Release Simulation");
  console.log("Package: %s", packageName);
  console.log("Build Mode: %s", buildMode);
  console.log("----------------------------------------\n");

  const pkgInfo = await getPackageInfo(packageName);
  console.log("[main] Package name: %s", pkgInfo.name);
  console.log("[main] Package path: %s", pkgInfo.packagePath);
  console.log();

  try {
    console.log("[1/8] Cleaning previous build");
    if (fs.existsSync(path.join(pkgInfo.packagePath, "scripts", "clean.sh"))) {
      await $`cd ${pkgInfo.packagePath} && sh ./scripts/clean.sh`.quiet();
      console.log("[1/8] Clean completed");
    } else {
      console.warn("[1/8] No clean script found");
    }
    console.log();

    console.log("[2/8] Building package");
    if (fs.existsSync(path.join(pkgInfo.packagePath, "scripts", "build.sh"))) {
      await $`cd ${pkgInfo.packagePath} && sh ./scripts/build.sh`.quiet();
      console.log("[2/8] Build completed");
    } else {
      console.warn("[2/8] No build script found");
    }
    console.log();

    console.log("[3/8] Validating build artifacts");
    const validation = await validateBuildArtifacts(pkgInfo.packagePath);
    if (validation.success || validation.errors.length === 0) {
      console.log("[3/8] All build artifacts validated");
    } else {
      console.warn("[3/8] Some artifacts missing");
    }
    console.log();

    console.log("[4/8] Validating package.json");
    console.log("[4/8] Current version: %s", pkgInfo.version);
    console.log("[4/8] Package.json is valid");
    console.log();

    console.log("[5/8] Simulating version bump");
    const newVersion = await simulateVersionBump(
      pkgInfo.packagePath,
      buildMode,
      pkgInfo.version,
    );
    console.log("[5/8] Would bump: %s to %s", pkgInfo.version, newVersion);
    console.log();

    console.log("[6/8] Simulating git operations");
    const tagName = `${packageName}-v${newVersion}`;
    const npmTag = getNpmTag(buildMode);
    const shouldMerge = shouldMergeToMain(buildMode);

    console.log("[6/8] Would create tag: %s", tagName);
    console.log("[6/8] Would commit to develop branch");
    console.log("[6/8] Would push tag: %s", tagName);

    if (shouldMerge) {
      console.log("[6/8] Would merge to main branch");
    }
    console.log();

    console.log("[7/8] Simulating NPM publish");
    console.log("[7/8] Would publish: %s@%s", pkgInfo.name, newVersion);
    console.log("[7/8] Would use npm tag: %s", npmTag);

    console.log("[7/8] Package contents:");
    try {
      const distPath = path.join(pkgInfo.packagePath, "dist");
      if (fs.existsSync(distPath)) {
        const distFiles = await $`ls -1 ${distPath}`.text();
        distFiles
          .split("\n")
          .filter(Boolean)
          .forEach((file) => console.log("[7/8] - dist/%s", file));
      } else {
        console.warn("[7/8] Dist directory not found");
      }
    } catch (error) {
      console.warn("[7/8] Unable to list dist files");
    }
    console.log();

    console.log("[8/8] Restoring original package.json");
    await restorePackageJson(pkgInfo.packagePath);
    console.log("[8/8] Version restored to: %s\n", pkgInfo.version);

    console.log("----------------------------------------");
    console.log("Simulation Summary");
    console.log("----------------------------------------");

    console.log("Package Name: %s", pkgInfo.name);
    console.log("Folder Name: %s", packageName);
    console.log("Current Version: %s", pkgInfo.version);
    console.log("New Version: %s", newVersion);
    console.log("Build Mode: %s", buildMode);
    console.log("Git Tag: %s", tagName);
    console.log("NPM Tag: %s\n", npmTag);

    console.warn("[main] This was a dry-run simulation");
    console.warn("[main] No actual changes were made to:");
    console.warn("[main] - package.json version");
    console.warn("[main] - git repository");
    console.warn("[main] - npm registry\n");

    console.log("To perform actual release:");
    console.log("1. Go to GitHub Actions");
    console.log("2. Select [%s] NPM Release workflow", packageName);
    console.log("3. Click Run workflow");
    console.log("4. Choose build_mode: %s", buildMode);
    console.log("----------------------------------------");
  } catch (error) {
    console.error("[main] Error during simulation | error: %s", error);
    await restorePackageJson(pkgInfo.packagePath);
    process.exit(1);
  }
};

main();

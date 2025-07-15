#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Main application package.json path
const APP_PACKAGE_PATH = './app/package.json';

// Packages to unify versions
const PACKAGES_TO_UNIFY = {
  'react': 'dependencies',
  'react-dom': 'dependencies',
  'tailwindcss': 'devDependencies',
  '@types/react': 'devDependencies',
  '@types/react-dom': 'devDependencies'
};

// Other package.json file paths to check
const OTHER_PACKAGE_PATHS = [
  './docs/package.json',
  './app/template/new-template/package.json'
];

function readPackageJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return null;
  }
}

function writePackageJson(filePath, packageData) {
  try {
    const content = JSON.stringify(packageData, null, 2) + '\n';
    fs.writeFileSync(filePath, content);
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error.message);
    return false;
  }
}

function getVersionFromApp(packageName, appPackage) {
  // Check dependencies first, then devDependencies
  if (appPackage.dependencies && appPackage.dependencies[packageName]) {
    return appPackage.dependencies[packageName];
  }
  if (appPackage.devDependencies && appPackage.devDependencies[packageName]) {
    return appPackage.devDependencies[packageName];
  }
  return null;
}

function main() {
  console.log('Starting to unify React and Tailwind versions...\n');

  // Read main application package.json
  const appPackage = readPackageJson(APP_PACKAGE_PATH);
  if (!appPackage) {
    console.error('Unable to read main application package.json');
    process.exit(1);
  }

  console.log('Main application version information:');
  const appVersions = {};
  for (const packageName of Object.keys(PACKAGES_TO_UNIFY)) {
    const version = getVersionFromApp(packageName, appPackage);
    if (version) {
      appVersions[packageName] = version;
      console.log(`  ${packageName}: ${version}`);
    }
  }
  console.log('');

  // Process other package.json files
  let totalUpdated = 0;
  
  for (const packagePath of OTHER_PACKAGE_PATHS) {
    if (!fs.existsSync(packagePath)) {
      console.log(`Skipping non-existent file: ${packagePath}`);
      continue;
    }

    console.log(`Checking ${packagePath}:`);
    const packageData = readPackageJson(packagePath);
    if (!packageData) {
      continue;
    }

    let updated = false;
    const changes = [];

    for (const [packageName, expectedSection] of Object.entries(PACKAGES_TO_UNIFY)) {
      const appVersion = appVersions[packageName];
      if (!appVersion) continue;

      // Check dependencies
      if (packageData.dependencies && packageData.dependencies[packageName]) {
        const currentVersion = packageData.dependencies[packageName];
        if (currentVersion !== appVersion) {
          packageData.dependencies[packageName] = appVersion;
          changes.push(`  dependencies.${packageName}: ${currentVersion} → ${appVersion}`);
          updated = true;
        }
      }

      // Check devDependencies
      if (packageData.devDependencies && packageData.devDependencies[packageName]) {
        const currentVersion = packageData.devDependencies[packageName];
        if (currentVersion !== appVersion) {
          packageData.devDependencies[packageName] = appVersion;
          changes.push(`  devDependencies.${packageName}: ${currentVersion} → ${appVersion}`);
          updated = true;
        }
      }
    }

    if (updated) {
      if (writePackageJson(packagePath, packageData)) {
        console.log('  Update successful:');
        changes.forEach(change => console.log(change));
        totalUpdated++;
      } else {
        console.log('  Update failed');
      }
    } else {
      console.log('  Versions are already unified, no update needed');
    }
    console.log('');
  }

  console.log(`Completed! Updated ${totalUpdated} files`);
  
  if (totalUpdated > 0) {
    console.log('\nRecommended to run the following command to update dependencies:');
    console.log('  pnpm install');
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
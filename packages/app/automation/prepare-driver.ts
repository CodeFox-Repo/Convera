import { prepareChromedriver } from "./runtime.js";

prepareChromedriver()
  .then((result) => {
    console.log(
      `${result.cached ? "Using" : "Prepared"} Chromedriver ${result.version} at ${result.driverPath}`,
    );
  })
  .catch((error) => {
    console.error(
      "Failed to prepare Chromedriver:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });

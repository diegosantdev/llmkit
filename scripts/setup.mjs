#!/usr/bin/env node
import {
  createPlan,
  createUninstallPlan,
  installPlan,
  parseOptions,
  printReport,
  report,
  requireNode,
  uninstallPlan,
  usage,
} from './installation.mjs';

try {
  requireNode();
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
  } else if (options.uninstall) {
    let plan = createUninstallPlan(options);
    const result = uninstallPlan(plan, options);
    if (result.ok && !options.dryRun) {
      plan = createUninstallPlan(options);
    }
    printReport(report(plan, 'uninstall', { ...result, dryRun: options.dryRun }), options.json);
    if (!result.ok) {
      process.exitCode = 1;
    }
  } else {
    let plan = createPlan(options);
    const result = installPlan(plan, options);
    if (result.ok && !options.dryRun) {
      plan = createPlan(options);
    }
    printReport(report(plan, 'setup', { ...result, dryRun: options.dryRun }), options.json);
    if (!result.ok) {
      process.exitCode = 1;
    }
  }
} catch (error) {
  if (process.argv.includes('--json')) {
    const operation = process.argv.includes('--uninstall') ? 'uninstall' : 'setup';
    console.log(JSON.stringify({ operation, ok: false, error: error.message }));
  } else {
    console.error(`setup: ${error.message}\n${usage}`);
  }
  process.exitCode = 2;
}

#!/usr/bin/env node
import { createPlan, parseOptions, printReport, report, requireNode, usage } from './installation.mjs';

try {
  requireNode();
  const options = parseOptions(process.argv.slice(2), { doctor: true });
  if (options.help) {
    console.log(usage);
  } else {
    const plan = createPlan(options);
    const ok = plan.files.every((file) => file.status === 'identical' || file.status === 'equivalent');
    const summary = report(plan, 'doctor', {
      ok,
      runtime: { node: process.versions.node },
      scope: 'File content compared with this checkout; LF and CRLF are equivalent in Markdown. Client discovery and hook activation are not tested.',
    });
    printReport(summary, options.json);
    if (!ok) {
      process.exitCode = 1;
    }
  }
} catch (error) {
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ operation: 'doctor', ok: false, error: error.message }));
  } else {
    console.error(`doctor: ${error.message}\n${usage}`);
  }
  process.exitCode = 2;
}

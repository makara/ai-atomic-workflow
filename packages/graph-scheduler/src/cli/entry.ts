import { initConfig } from './init.js';
import { showConfig } from './show.js';
import { validateConfig } from './validate.js';

const HELP_TEXT = `atom-graph-config <command> [options]

Commands:
  init [--cwd <path>]      Initialize .graph-scheduler/ directory
  validate [--cwd <path>]  Validate config.json + graph definitions
  show [--cwd <path>]      Show current configuration

Options:
  --cwd <path>  Project root directory (default: process.cwd())
  --help        Show help
`;

function parseCwd(args: string[]): string {
  const cwdIndex = args.indexOf('--cwd');
  if (cwdIndex !== -1 && cwdIndex + 1 < args.length) {
    return args[cwdIndex + 1];
  }
  return process.cwd();
}

function printHelp(): void {
  console.log(HELP_TEXT);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const command = args[0];
  const cwd = parseCwd(args);

  try {
    switch (command) {
      case 'init': {
        const report = await initConfig(cwd);
        console.log('Created:');
        if (report.created.length === 0) {
          console.log('  (none)');
        } else {
          for (const item of report.created) {
            console.log(`  ${item}`);
          }
        }
        console.log('Existed:');
        if (report.existed.length === 0) {
          console.log('  (none)');
        } else {
          for (const item of report.existed) {
            console.log(`  ${item}`);
          }
        }
        console.log(`Project root: ${report.projectRoot}`);
        break;
      }
      case 'validate': {
        const report = await validateConfig(cwd);
        console.log(`Valid: ${report.valid}`);
        if (report.errors.length > 0) {
          console.log('Errors:');
          for (const err of report.errors) {
            console.log(`  - ${err}`);
          }
        }
        process.exitCode = report.valid ? 0 : 1;
        break;
      }
      case 'show': {
        await showConfig(cwd);
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        console.log();
        printHelp();
        process.exitCode = 1;
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

main();

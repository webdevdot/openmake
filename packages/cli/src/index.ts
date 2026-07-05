import { exportJsonCommand } from './commands/export-json.js';
import { codegenCommand } from './commands/codegen.js';
import { newCommand } from './commands/new.js';
import { HELP_TEXT } from './help.js';
import { defaultIo, type CliIo } from './io.js';

export type { CliIo } from './io.js';

/** Runs the openmake CLI given argv (excluding node/script), returns the process exit code. */
export async function run(argv: string[], io: CliIo = defaultIo): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h') {
    io.stdout(HELP_TEXT);
    return command ? 0 : 1;
  }

  switch (command) {
    case 'export-json':
      return exportJsonCommand(rest, io);
    case 'codegen':
      return codegenCommand(rest, io);
    case 'new':
      return newCommand(rest, io);
    default:
      io.stderr(`Unknown command "${command}".\n\n`);
      io.stderr(HELP_TEXT);
      return 1;
  }
}

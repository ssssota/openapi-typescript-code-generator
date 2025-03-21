import { ExecaChildProcess, execa } from "execa";

export const shell = (command: string, cwd: string = process.cwd()): ExecaChildProcess<string> => {
  return execa(command, {
    stdio: ["pipe", "pipe", "inherit"],
    shell: true,
    cwd,
  });
};

import chalk from "chalk";

export const theme = {
  primary: chalk.hex("#00d2ff"),
  accent: chalk.hex("#3a7bd5"),
  subtle: chalk.hex("#7f8c8d"),
  success: chalk.hex("#2ecc71"),
  warning: chalk.hex("#f39c12"),
  error: chalk.hex("#e74c3c"),
  freeBadge: chalk.bgHex("#00b4d8").black.bold(" FREE "),
  proBadge: chalk.bgHex("#8e44ad").white.bold(" PRO "),
  oceanBadge: chalk.bgHex("#0077b6").white.bold(" OCEANCODE "),

  banner: () => {
    const text = `
   ___                            ____          _      
  / _ \\  ___ ___   __ _  _ __    / ___|  ___   __| |  ___ 
 | | | |/ __/ _ \\ / _\` || \x27_ \\  | |     / _ \\ / _\` | / _ \\
 | |_| | (_|  __/| (_| || | | | | |___ | (_) | (_| ||  __/
  \\___/ \\___\\___| \\__,_||_| |_|  \\____| \\___/ \\__,_| \\___|
`;
    return chalk.hex("#00d2ff").bold(text);
  },
  
  divider: (char = "-", len = 60) => chalk.dim(char.repeat(len)),
  formatPath: (p: string) => chalk.underline.cyan(p),
  formatModel: (m: string) => chalk.bold.hex("#00f2fe")(m),
  formatCmd: (cmd: string) => chalk.hex("#ff9f43")(`$ ${cmd}`),
};

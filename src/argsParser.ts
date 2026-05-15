export class ArgumentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentParseError";
  }
}

export function parseShellArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  let tokenStarted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quote === "'") {
      if (char === "'") {
        quote = undefined;
      } else {
        current += char;
      }
      tokenStarted = true;
      continue;
    }

    if (char === "\\") {
      const skip = lineContinuationLength(input, index);
      if (skip > 0 && quote !== "'") {
        index += skip - 1;
        continue;
      }

      if (quote === "\"") {
        if (next === undefined) {
          current += char;
        } else {
          current += next;
          index += 1;
        }
        tokenStarted = true;
        continue;
      }

      if (next === undefined) {
        current += char;
      } else {
        current += next;
        index += 1;
      }
      tokenStarted = true;
      continue;
    }

    if (quote === "\"") {
      if (char === "\"") {
        quote = undefined;
      } else {
        current += char;
      }
      tokenStarted = true;
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      tokenStarted = true;
      continue;
    }

    if (isWhitespace(char)) {
      if (tokenStarted) {
        args.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  if (quote) {
    throw new ArgumentParseError(`Unclosed ${quote === "'" ? "single" : "double"} quote in arguments.`);
  }

  if (tokenStarted) {
    args.push(current);
  }

  return args;
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function lineContinuationLength(input: string, index: number): number {
  const next = input[index + 1];
  const afterNext = input[index + 2];

  if (next === "\n") {
    return 2;
  }

  if (next === "\r" && afterNext === "\n") {
    return 3;
  }

  return 0;
}

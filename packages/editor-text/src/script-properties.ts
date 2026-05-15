export type ScriptEditableValue = boolean | number | string;

const CLASS_FIELD_PATTERN =
  /^(?<indent>\s*)(?:(?:public|private|protected|readonly|static)\s+)*(?<name>[A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*(?<value>[^;\n]+);/gm;
const EXPORTED_VARIABLE_PATTERN =
  /^(?<indent>\s*)export\s+(?:const|let|var)\s+(?<name>[A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*(?<value>[^;\n]+);/gm;

export function readScriptEditableValues(source: string): Record<string, ScriptEditableValue> {
  const values: Record<string, ScriptEditableValue> = {};

  collectMatches(values, source, EXPORTED_VARIABLE_PATTERN);
  collectMatches(values, source, CLASS_FIELD_PATTERN);
  return values;
}

export function updateScriptEditableValue(
  source: string,
  propertyName: string,
  value: ScriptEditableValue
): string | null {
  const nextLiteral = serializeScriptEditableValue(value);
  const nextSource = replaceInitializer(source, EXPORTED_VARIABLE_PATTERN, propertyName, nextLiteral);

  if (nextSource !== source) {
    return nextSource;
  }

  const updatedClassSource = replaceInitializer(source, CLASS_FIELD_PATTERN, propertyName, nextLiteral);
  return updatedClassSource === source ? null : updatedClassSource;
}

function collectMatches(
  target: Record<string, ScriptEditableValue>,
  source: string,
  pattern: RegExp
): void {
  pattern.lastIndex = 0;

  for (const match of source.matchAll(pattern)) {
    const propertyName = match.groups?.name;
    const rawValue = match.groups?.value;

    if (!propertyName || !rawValue) {
      continue;
    }

    const parsedValue = parseScriptEditableValue(rawValue);

    if (parsedValue !== null) {
      target[propertyName] = parsedValue;
    }
  }
}

function replaceInitializer(source: string, pattern: RegExp, propertyName: string, nextLiteral: string): string {
  pattern.lastIndex = 0;
  let updated = false;

  return source.replace(pattern, (...args) => {
    const groups = args[args.length - 1] as { indent?: string; name?: string } | undefined;

    if (updated || groups?.name !== propertyName) {
      return args[0] as string;
    }

    updated = true;
    const indent = groups.indent ?? "";
    const declaration = (args[0] as string).trimStart();
    const prefix = declaration.slice(0, declaration.indexOf("=")).trimEnd();
    return `${indent}${prefix} = ${nextLiteral};`;
  });
}

function parseScriptEditableValue(rawValue: string): ScriptEditableValue | null {
  const normalized = rawValue.trim();

  if (/^(?:true|false)$/.test(normalized)) {
    return normalized === "true";
  }

  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return Number(normalized);
  }

  if (
    (normalized.startsWith("\"") && normalized.endsWith("\"")) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    const quote = normalized[0];
    const inner = normalized.slice(1, -1);

    if (quote === "\"") {
      try {
        return JSON.parse(normalized) as string;
      } catch {
        return null;
      }
    }

    return inner.replace(/\\\\/g, "\\").replace(/\\'/g, "'");
  }

  return null;
}

function serializeScriptEditableValue(value: ScriptEditableValue): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return String(value);
}

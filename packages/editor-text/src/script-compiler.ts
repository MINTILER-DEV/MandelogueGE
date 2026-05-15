import ts from "typescript";

export interface TypeScriptCompilationResult {
  code: string;
  diagnostics: string[];
}

export function compileTypeScriptModule(source: string, filePath: string): TypeScriptCompilationResult {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filePath,
    reportDiagnostics: true
  });

  return {
    code: result.outputText,
    diagnostics: (result.diagnostics ?? []).map((diagnostic) => formatDiagnostic(diagnostic))
  };
}

export function evaluateCommonJsModule(
  code: string,
  filePath: string,
  imports: Record<string, unknown>
): Record<string, unknown> {
  const module = {
    exports: {} as Record<string, unknown>
  };
  const require = (specifier: string): unknown => {
    if (specifier in imports) {
      return imports[specifier];
    }

    throw new Error(`Script "${filePath}" imports unsupported module "${specifier}".`);
  };

  new Function("exports", "module", "require", `${code}\n//# sourceURL=${filePath}`)(
    module.exports,
    module,
    require
  );

  return module.exports;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");

  if (!diagnostic.file || typeof diagnostic.start !== "number") {
    return message;
  }

  const { character, line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${line + 1}:${character + 1} ${message}`;
}

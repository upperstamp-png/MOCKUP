'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = ['server', 'public', 'admin', 'scripts', 'tests'];
const IGNORE_DIRS = new Set(['node_modules', '.git', 'Kit_Documentos_King_Sports']);

function collectFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, results);
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function checkJsSyntax(filePath, code, label = filePath) {
  try {
    // Wrap in function body only if checking module vs script cleanly using vm.Script
    new vm.Script(code, { filename: label });
    return null;
  } catch (err) {
    return { file: label, message: err.message };
  }
}

function extractInlineScripts(html) {
  const scripts = [];
  const regex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;
  while ((match = regex.exec(html)) !== null) {
    const typeMatch = match[0].match(/type=["']([^"']+)["']/i);
    if (typeMatch && typeMatch[1].toLowerCase() === 'application/ld+json') {
      continue;
    }
    index += 1;
    scripts.push({ index, content: match[1] });
  }
  return scripts;
}

function main() {
  const errors = [];
  let checkedJs = 0;
  let checkedHtmlScripts = 0;

  for (const dirName of TARGET_DIRS) {
    const files = collectFiles(path.join(ROOT, dirName));
    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.cjs')) {
        const content = fs.readFileSync(file, 'utf8');
        // Module syntax check wraps in CJS function wrapper so top-level `return` or `module` matches Node
        const wrapped = `(function(exports, require, module, __filename, __dirname) {\n${content}\n});`;
        const err = checkJsSyntax(file, wrapped, path.relative(ROOT, file));
        if (err) errors.push(err);
        checkedJs += 1;
      } else if (file.endsWith('.html')) {
        const html = fs.readFileSync(file, 'utf8');
        const inlineScripts = extractInlineScripts(html);
        for (const s of inlineScripts) {
          const err = checkJsSyntax(
            file,
            s.content,
            `${path.relative(ROOT, file)}#<script #${s.index}>`
          );
          if (err) errors.push(err);
          checkedHtmlScripts += 1;
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('Erros de sintaxe detectados:');
    for (const e of errors) {
      console.error(` - ${e.file}: ${e.message}`);
    }
    process.exit(1);
  }

  console.log(
    `Sintaxe OK: ${checkedJs} arquivos JS/CJS e ${checkedHtmlScripts} scripts inline HTML validados.`
  );
}

main();

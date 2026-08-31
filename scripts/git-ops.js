const git = require('isomorphic-git');
const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '..');

async function main() {
  const action = process.argv[2] || 'init-and-commit';

  if (action === 'init-and-commit') {
    console.log('1. Inicializando repositório Git...');
    await git.init({ fs, dir, defaultBranch: 'main' });

    console.log('2. Indexando arquivos (respeitando .gitignore)...');
    
    // Lista todos os arquivos recursivamente
    function getFiles(currentDir, relativePath = '') {
      let results = [];
      const list = fs.readdirSync(currentDir);
      for (const file of list) {
        if (file === '.git' || file === 'node_modules' || file === '.next') continue;
        const fullPath = path.join(currentDir, file);
        const rel = relativePath ? `${relativePath}/${file}` : file;
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getFiles(fullPath, rel));
        } else {
          results.push(rel);
        }
      }
      return results;
    }

    const allFiles = getFiles(dir);
    console.log(`Arquivos encontrados para adicionar: ${allFiles.length}`);

    for (const filepath of allFiles) {
      try {
        await git.add({ fs, dir, filepath });
      } catch (err) {
        // Ignora arquivos bloqueados pelo .gitignore
      }
    }

    console.log('3. Criando commit inicial...');
    const sha = await git.commit({
      fs,
      dir,
      author: {
        name: 'Developer',
        email: 'dev@mockup-studio.local',
      },
      message: 'feat: Plataforma Mockup Studio B2B com calibração de máscaras e remoção de fundo por IA',
    });

    console.log('✅ Commit realizado com sucesso! SHA:', sha);
  }
}

main().catch(err => {
  console.error('Erro no script Git:', err);
  process.exit(1);
});

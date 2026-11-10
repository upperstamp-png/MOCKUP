const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');
const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '..');

async function main() {
  const action = process.argv[2] || 'status';

  if (action === 'init-and-commit') {
    console.log('1. Inicializando repositório Git...');
    await git.init({ fs, dir, defaultBranch: 'main' });

    console.log('2. Indexando arquivos...');
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
    for (const filepath of allFiles) {
      try {
        await git.add({ fs, dir, filepath });
      } catch (err) {}
    }

    console.log('3. Criando commit...');
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
  } else if (action === 'push') {
    const remoteUrl = process.argv[3] || process.env.GITHUB_REPO_URL;
    const token = process.argv[4] || process.env.GITHUB_TOKEN;

    if (!remoteUrl) {
      console.error('Erro: informe a URL do repositório GitHub. Exemplo: node scripts/git-ops.js push https://github.com/usuario/repo.git <TOKEN>');
      process.exit(1);
    }

    console.log(`Subindo para ${remoteUrl}...`);
    const pushResult = await git.push({
      fs,
      http,
      dir,
      remote: 'origin',
      url: remoteUrl,
      ref: 'main',
      force: true,
      onAuth: () => ({
        username: token || 'git',
        password: token || '',
      }),
    });

    console.log('✅ Push para o GitHub realizado com sucesso!', pushResult);
  } else if (action === 'status') {
    const branches = await git.listBranches({ fs, dir });
    const log = await git.log({ fs, dir, depth: 3 });
    console.log('Branch atual:', branches);
    console.log('Últimos commits:', log.map(c => ({ sha: c.oid.substring(0, 7), message: c.commit.message })));
  }
}

main().catch(err => {
  console.error('Erro no script Git:', err);
  process.exit(1);
});

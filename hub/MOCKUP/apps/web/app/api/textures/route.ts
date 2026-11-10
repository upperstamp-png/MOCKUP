import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function traceImageToSvg(srcPath: string, destSvgPath: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const potrace = require('potrace');
      const fileBuffer = fs.readFileSync(srcPath);
      const params = {
        threshold: 128,
        color: '#000000',
        background: 'transparent',
        turdSize: 2,
        optTolerance: 0.2,
      };

      potrace.trace(fileBuffer, params, (err: any, svg: string) => {
        if (!err && svg) {
          try {
            fs.writeFileSync(destSvgPath, svg);
          } catch (e) {
            console.warn('Erro ao salvar SVG vetorizado:', e);
          }
        }
        resolve();
      });
    } catch (err) {
      console.warn('Erro ao executar potrace:', err);
      resolve();
    }
  });
}

export async function GET() {
  try {
    const localTexturesDir = 'C:\\Users\\user\\Documents\\mockup\\textures';
    const publicTexturesDir = path.join(process.cwd(), 'public', 'textures');

    if (!fs.existsSync(publicTexturesDir)) {
      fs.mkdirSync(publicTexturesDir, { recursive: true });
    }

    // 1. Sincroniza e auto-vetoriza da pasta C:\Users\user\Documents\mockup\textures
    if (fs.existsSync(localTexturesDir)) {
      const userFiles = fs.readdirSync(localTexturesDir);
      for (const file of userFiles) {
        if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
          const srcPath = path.join(localTexturesDir, file);
          const destPath = path.join(publicTexturesDir, file);
          try {
            fs.copyFileSync(srcPath, destPath);
          } catch {}

          // Se não houver SVG correspondente, gera automaticamente via Potrace
          const baseName = file.replace(/\.[^/.]+$/, '');
          const svgName = `${baseName}.svg`;
          const localSvgPath = path.join(localTexturesDir, svgName);
          const publicSvgPath = path.join(publicTexturesDir, svgName);

          if (!fs.existsSync(localSvgPath) || !fs.existsSync(publicSvgPath)) {
            await traceImageToSvg(srcPath, publicSvgPath);
            if (fs.existsSync(publicSvgPath)) {
              try {
                fs.copyFileSync(publicSvgPath, localSvgPath);
              } catch {}
            }
          }
        } else if (file.endsWith('.svg')) {
          const srcPath = path.join(localTexturesDir, file);
          const destPath = path.join(publicTexturesDir, file);
          try {
            fs.copyFileSync(srcPath, destPath);
          } catch {}
        }
      }
    }

    // 2. Coleta texturas mapeadas (priorizando a versão SVG para troca de cores)
    const files = fs.readdirSync(publicTexturesDir);
    const uniqueBaseNames = new Set<string>();

    files.forEach((file) => {
      if (/\.(png|jpg|jpeg|webp|svg)$/i.test(file)) {
        const base = file.replace(/\.[^/.]+$/, '');
        uniqueBaseNames.add(base);
      }
    });

    const textures = Array.from(uniqueBaseNames).map((base) => {
      const hasSvg = fs.existsSync(path.join(publicTexturesDir, `${base}.svg`));
      const hasPng = fs.existsSync(path.join(publicTexturesDir, `${base}.png`));

      const svgUrl = hasSvg ? `/textures/${base}.svg` : `/textures/${base}.png`;
      const thumbUrl = hasPng ? `/textures/${base}.png` : `/textures/${base}.svg`;

      const formattedName = base
        .replace(/_/g, ' ')
        .replace(/texture/i, 'Textura')
        .replace(/\b\w/g, (l) => l.toUpperCase());

      return {
        id: `tex_${base}`,
        name: formattedName,
        filename: hasSvg ? `${base}.svg` : `${base}.png`,
        url: svgUrl,
        thumbnail_url: thumbUrl,
        svg_file_url: svgUrl,
        is_vector: hasSvg,
        category: 'Estampa / Textura',
        targetPart: 'all',
        created_at: new Date().toISOString(),
      };
    });

    return NextResponse.json({ success: true, textures });
  } catch (error: any) {
    console.error('Erro ao listar e auto-vetorizar texturas:', error);
    return NextResponse.json(
      { success: false, error: error.message, textures: [] },
      { status: 500 }
    );
  }
}

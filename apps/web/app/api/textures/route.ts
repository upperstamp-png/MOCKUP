import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const localTexturesDir = 'C:\\Users\\user\\Documents\\mockup\\textures';
    const publicTexturesDir = path.join(process.cwd(), 'public', 'textures');

    // Garante que a pasta public/textures existe
    if (!fs.existsSync(publicTexturesDir)) {
      fs.mkdirSync(publicTexturesDir, { recursive: true });
    }

    // Se a pasta do usuário existir, copia os arquivos para public/textures
    if (fs.existsSync(localTexturesDir)) {
      const userFiles = fs.readdirSync(localTexturesDir);
      for (const file of userFiles) {
        if (/\.(png|jpg|jpeg|webp|svg)$/i.test(file)) {
          const srcPath = path.join(localTexturesDir, file);
          const destPath = path.join(publicTexturesDir, file);
          try {
            fs.copyFileSync(srcPath, destPath);
          } catch (err) {
            console.error(`Erro ao sincronizar textura ${file}:`, err);
          }
        }
      }
    }

    // Lê todos os arquivos na pasta pública de texturas
    const files = fs.readdirSync(publicTexturesDir);
    const textures = files
      .filter((file) => /\.(png|jpg|jpeg|webp|svg)$/i.test(file))
      .map((file) => {
        const id = file.replace(/\.[^/.]+$/, '');
        // Formata nome amigável: texture_01 -> Textura 01
        const formattedName = id
          .replace(/_/g, ' ')
          .replace(/texture/i, 'Textura')
          .replace(/\b\w/g, (l) => l.toUpperCase());

        return {
          id: `tex_${id}`,
          name: formattedName,
          filename: file,
          url: `/textures/${file}`,
          thumbnail_url: `/textures/${file}`,
          svg_file_url: `/textures/${file}`,
          category: 'Estampa / Textura',
          targetPart: 'all',
          created_at: new Date().toISOString(),
        };
      });

    return NextResponse.json({ success: true, textures });
  } catch (error: any) {
    console.error('Erro ao listar texturas:', error);
    return NextResponse.json(
      { success: false, error: error.message, textures: [] },
      { status: 500 }
    );
  }
}

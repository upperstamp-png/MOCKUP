import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { filename, threshold = 128, color = '#000000' } = body;

    if (!filename) {
      return NextResponse.json({ success: false, error: 'Filename is required' }, { status: 400 });
    }

    const localTexturesDir = 'C:\\Users\\user\\Documents\\mockup\\textures';
    const publicTexturesDir = path.join(process.cwd(), 'public', 'textures');

    let filePath = path.join(localTexturesDir, filename);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(publicTexturesDir, filename);
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const potrace = require('potrace');
    const fileBuffer = fs.readFileSync(filePath);

    const params = {
      threshold,
      color,
      background: 'transparent',
      turdSize: 2,
      optTolerance: 0.2,
    };

    const svg: string = await new Promise((resolve, reject) => {
      potrace.trace(fileBuffer, params, (err: any, svgContent: string) => {
        if (err) reject(err);
        else resolve(svgContent);
      });
    });

    const baseName = filename.replace(/\.[^/.]+$/, '');
    const svgFilename = `${baseName}.svg`;

    const destUserSvg = path.join(localTexturesDir, svgFilename);
    const destPublicSvg = path.join(publicTexturesDir, svgFilename);

    try {
      fs.writeFileSync(destUserSvg, svg);
      fs.writeFileSync(destPublicSvg, svg);
    } catch (writeErr) {
      console.warn('Erro ao salvar cópia em disco:', writeErr);
    }

    return NextResponse.json({
      success: true,
      svg,
      svgFilename,
      url: `/textures/${svgFilename}`,
      message: 'Textura PNG vetorizada com sucesso em SVG com fundo transparente!',
    });
  } catch (error: any) {
    console.error('Erro na vetorização de textura:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

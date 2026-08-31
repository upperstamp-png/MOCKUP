import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { slug: string[] } }
) {
  try {
    const filename = params.slug.join('/');
    const localTexturesDir = 'C:\\Users\\user\\Documents\\mockup\\textures';
    const publicTexturesDir = path.join(process.cwd(), 'public', 'textures');

    let filePath = path.join(publicTexturesDir, filename);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(localTexturesDir, filename);
    }

    if (!fs.existsSync(filePath)) {
      return new NextResponse('Texture not found', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();

    let contentType = 'application/octet-stream';
    if (ext === '.svg') contentType = 'image/svg+xml;charset=utf-8';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.webp') contentType = 'image/webp';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

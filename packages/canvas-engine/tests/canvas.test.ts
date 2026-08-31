import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  normalizeHexColor,
  getElementBounds,
  hitTestElement,
  findClosestPantone,
  PANTONE_LEGAL_DISCLAIMER,
} from '../dist/index.js';
import type { MockupElement } from '@mockup/types';

describe('Canvas Engine 2D - Testes Unitários', () => {
  it('deve normalizar cores hexadecimais de 3 dígitos para 6 dígitos', () => {
    assert.strictEqual(normalizeHexColor('#fff'), '#ffffff');
    assert.strictEqual(normalizeHexColor('#000'), '#000000');
    assert.strictEqual(normalizeHexColor('#38bdf8'), '#38bdf8');
  });

  it('deve encontrar correspondência Pantone correta e ter aviso legal', () => {
    const matchBlue = findClosestPantone('#1d4ed8');
    assert.strictEqual(matchBlue.pantone.code, 'PANTONE 286 C');
    assert.ok(matchBlue.distance < 1, 'Distância deve ser 0 ou muito próxima para cor exata');

    const matchOrange = findClosestPantone('#ea580c');
    assert.strictEqual(matchOrange.pantone.code, 'PANTONE 1655 C');

    assert.ok(
      PANTONE_LEGAL_DISCLAIMER.includes('aproximação digital'),
      'Deve conter aviso legal sobre variação têxtil'
    );
  });

  it('deve calcular corretamente as dimensões de bounding box de elementos', () => {
    const textElement: MockupElement = {
      id: 'txt_01',
      type: 'text',
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      visible: true,
      view: 'front',
      zIndex: 1,
      text: 'SILVA',
      fontFamily: 'Inter',
      fontSize: 40,
      fontWeight: 'bold',
      letterSpacing: 2,
      color: '#ffffff',
      align: 'center',
    };

    const bounds = getElementBounds(textElement);
    assert.ok(bounds.width > 0, 'Largura calculada deve ser positiva');
    assert.ok(bounds.height > 0, 'Altura calculada deve ser positiva');
  });

  it('deve detectar clique dentro do elemento com hitTestElement', () => {
    const logoElement: MockupElement = {
      id: 'logo_01',
      type: 'logo',
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      visible: true,
      view: 'front',
      zIndex: 1,
      url: 'https://example.com/logo.png',
      naturalWidth: 100,
      naturalHeight: 100,
      aspectRatio: 1,
    };

    const canvasWidth = 600;
    const canvasHeight = 600;

    // Ponto central exato (300, 300)
    const hitCenter = hitTestElement({ x: 300, y: 300 }, logoElement, canvasWidth, canvasHeight);
    assert.strictEqual(hitCenter, true, 'Deve acertar no centro do elemento');

    // Ponto distante (50, 50)
    const hitOutside = hitTestElement({ x: 50, y: 50 }, logoElement, canvasWidth, canvasHeight);
    assert.strictEqual(hitOutside, false, 'Não deve acertar fora do elemento');
  });
});

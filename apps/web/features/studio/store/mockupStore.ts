import { create } from 'zustand';
import {
  LayerState,
  MockupElement,
  MockupView,
  ApparelModel,
  Pattern,
  GarmentPartType,
} from '@mockup/types';
import { STANDARD_20_COLORS } from '@mockup/canvas-engine';

export type GarmentPart = GarmentPartType;

interface MockupStoreState {
  version: number;
  modelId: string;
  patternId: string | null;
  backgroundColor: string;
  colorA: string; // Cor 1 da Textura
  colorB: string; // Cor 2 da Textura
  collarColor: string; // Cor da Gola
  frontColor: string;
  backColor: string;
  sleeveLeftColor: string;
  sleeveRightColor: string;
  sleevesColor: string;
  selectedPart: GarmentPart;
  elements: MockupElement[];
  view: MockupView;
  selectedElementId: string | null;
  clientName: string;
  notes: string;
  updatedAt: string;

  // Metadata caches
  currentModel: ApparelModel | null;
  currentPattern: Pattern | null;

  // Actions
  setModel: (model: ApparelModel) => void;
  setPattern: (pattern: Pattern | null) => void;
  setBackgroundColor: (color: string) => void;
  setColorA: (color: string) => void;
  setColorB: (color: string) => void;
  setCollarColor: (color: string) => void;
  setFrontColor: (color: string) => void;
  setBackColor: (color: string) => void;
  setSleeveLeftColor: (color: string) => void;
  setSleeveRightColor: (color: string) => void;
  setSleevesColor: (color: string) => void;
  setSelectedPart: (part: GarmentPart) => void;
  setColors: (colorA: string, colorB: string) => void;
  setView: (view: MockupView) => void;
  setClientName: (name: string) => void;
  setNotes: (notes: string) => void;
  setSelectedElementId: (id: string | null) => void;
  addElement: (element: MockupElement) => void;
  updateElement: (element: MockupElement) => void;
  updateElementsBatch: (elements: MockupElement[]) => void;
  removeElement: (id: string) => void;
  resetMockup: () => void;
  loadLayerState: (state: LayerState, model?: ApparelModel, pattern?: Pattern | null) => void;
  getLayerState: () => LayerState;
}

const INITIAL_STATE = {
  version: 1,
  modelId: 'model_camisa_gola_careca',
  patternId: 'pat_thunder',
  backgroundColor: '#ffffff', // Branco Puro Padrão
  colorA: STANDARD_20_COLORS[0].hex, // Cor 1 da Textura
  colorB: STANDARD_20_COLORS[2].hex, // Cor 2 da Textura (Azul Bebê)
  collarColor: STANDARD_20_COLORS[2].hex, // Cor da Gola (Azul Bebê)
  frontColor: STANDARD_20_COLORS[0].hex,
  backColor: STANDARD_20_COLORS[0].hex,
  sleeveLeftColor: STANDARD_20_COLORS[0].hex,
  sleeveRightColor: STANDARD_20_COLORS[0].hex,
  sleevesColor: STANDARD_20_COLORS[0].hex,
  selectedPart: null as GarmentPart,
  view: 'both' as MockupView,
  selectedElementId: null as string | null,
  clientName: '',
  notes: '',
  updatedAt: new Date().toISOString(),
  currentModel: null,
  currentPattern: null,
  elements: [] as MockupElement[],
};

export const useMockupStore = create<MockupStoreState>((set, get) => ({
  ...INITIAL_STATE,

  setModel: (model) =>
    set({
      modelId: model.id,
      currentModel: model,
      updatedAt: new Date().toISOString(),
    }),

  setPattern: (pattern) =>
    set({
      patternId: pattern ? pattern.id : null,
      currentPattern: pattern,
      updatedAt: new Date().toISOString(),
    }),

  setBackgroundColor: (backgroundColor) =>
    set({
      backgroundColor,
      updatedAt: new Date().toISOString(),
    }),

  setColorA: (colorA) =>
    set({
      colorA,
      frontColor: colorA,
      backColor: colorA,
      sleeveLeftColor: colorA,
      sleeveRightColor: colorA,
      updatedAt: new Date().toISOString(),
    }),

  setColorB: (colorB) =>
    set({
      colorB,
      updatedAt: new Date().toISOString(),
    }),

  setCollarColor: (collarColor) =>
    set({
      collarColor, // Trocando a cor da gola troca APENAS a cor da gola de acordo com a máscara
      updatedAt: new Date().toISOString(),
    }),

  setFrontColor: (frontColor) =>
    set({
      frontColor,
      updatedAt: new Date().toISOString(),
    }),

  setBackColor: (backColor) =>
    set({
      backColor,
      updatedAt: new Date().toISOString(),
    }),

  setSleeveLeftColor: (sleeveLeftColor) =>
    set({
      sleeveLeftColor,
      updatedAt: new Date().toISOString(),
    }),

  setSleeveRightColor: (sleeveRightColor) =>
    set({
      sleeveRightColor,
      updatedAt: new Date().toISOString(),
    }),

  setSleevesColor: (sleevesColor) =>
    set({
      sleevesColor,
      sleeveLeftColor: sleevesColor,
      sleeveRightColor: sleevesColor,
      updatedAt: new Date().toISOString(),
    }),

  setSelectedPart: (selectedPart) =>
    set({
      selectedPart,
      selectedElementId: null,
    }),

  setColors: (colorA, colorB) =>
    set({
      colorA,
      colorB,
      updatedAt: new Date().toISOString(),
    }),

  setView: (view) => set({ view }),

  setClientName: (clientName) => set({ clientName }),

  setNotes: (notes) => set({ notes }),

  setSelectedElementId: (selectedElementId) =>
    set({
      selectedElementId,
      selectedPart: null,
    }),

  addElement: (element) =>
    set((state) => ({
      elements: [...state.elements, element],
      selectedElementId: element.id,
      selectedPart: null,
      updatedAt: new Date().toISOString(),
    })),

  updateElement: (updated) =>
    set((state) => ({
      elements: state.elements.map((el) => (el.id === updated.id ? updated : el)),
      updatedAt: new Date().toISOString(),
    })),

  updateElementsBatch: (elements) =>
    set({
      elements,
      updatedAt: new Date().toISOString(),
    }),

  removeElement: (id) =>
    set((state) => ({
      elements: state.elements.filter((el) => el.id !== id),
      selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
      updatedAt: new Date().toISOString(),
    })),

  resetMockup: () =>
    set({
      ...INITIAL_STATE,
      updatedAt: new Date().toISOString(),
    }),

  loadLayerState: (state, model, pattern) =>
    set({
      version: state.version,
      modelId: state.modelId,
      patternId: state.patternId || null,
      backgroundColor: state.backgroundColor || '#ffffff',
      colorA: state.colorA || STANDARD_20_COLORS[0].hex,
      colorB: state.colorB || STANDARD_20_COLORS[2].hex,
      collarColor: state.collarColor || STANDARD_20_COLORS[2].hex,
      frontColor: state.frontColor || state.colorA,
      backColor: state.backColor || state.colorA,
      sleeveLeftColor: state.sleeveLeftColor || state.colorA,
      sleeveRightColor: state.sleeveRightColor || state.colorA,
      sleevesColor: state.sleevesColor || state.colorA,
      selectedPart: state.selectedPart || null,
      elements: state.elements || [],
      view: state.view || 'both',
      selectedElementId: state.selectedElementId || null,
      clientName: state.clientName || '',
      notes: state.notes || '',
      updatedAt: state.updatedAt || new Date().toISOString(),
      currentModel: model || get().currentModel,
      currentPattern: pattern !== undefined ? pattern : get().currentPattern,
    }),

  getLayerState: (): LayerState => {
    const s = get();
    return {
      version: s.version,
      modelId: s.modelId,
      patternId: s.patternId,
      backgroundColor: s.backgroundColor,
      colorA: s.colorA,
      colorB: s.colorB,
      collarColor: s.collarColor,
      frontColor: s.frontColor,
      backColor: s.backColor,
      sleeveLeftColor: s.sleeveLeftColor,
      sleeveRightColor: s.sleeveRightColor,
      sleevesColor: s.sleevesColor,
      selectedPart: s.selectedPart,
      elements: s.elements,
      view: 'front',
      selectedElementId: s.selectedElementId,
      clientName: s.clientName,
      notes: s.notes,
      updatedAt: s.updatedAt,
    };
  },
}));

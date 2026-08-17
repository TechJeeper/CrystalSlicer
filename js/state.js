export const state = {
    blockW: 50,
    blockH: 50,
    blockD: 10,
    modelZScale: 1.0,
    modelXYScale: 1.0,
    sliceHalfCenter: false,
    modelZPos: 0,
    baseScale: 1.0,
    flattenFit: 1.0,
    lastUserFile: null
};

export const refs = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    crystalBlock: null,
    innerModelGroup: null,
    clipPlanes: [],
    currentMode: 'slicer'
};

export const PRINT_MIME = 'model/3mf';

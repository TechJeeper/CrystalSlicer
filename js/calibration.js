import { THREE } from './globals.js';
import { refs } from './state.js';
import { clearInnerModel } from './scene.js';
import { build3mfBlob } from './export-3mf.js';

export function generateVoxelText(text1, text2, plateW, plateH) {
    const canvas = document.createElement('canvas');
    const res = 2;
    const w = plateW * res;
    const h = plateH * res;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text1, w / 2, h / 2 - 12);
    ctx.fillText(text2, w / 2, h / 2 + 12);
    ctx.restore();
    const imgData = ctx.getImageData(0, 0, w, h).data;
    const voxels = [];
    const size = 1 / res;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (imgData[(y * w + x) * 4] > 128) {
                voxels.push({
                    x: (x / res) - (plateW / 2) + (size / 2),
                    y: (plateH / 2) - (y / res) - (size / 2),
                    size
                });
            }
        }
    }
    return voxels;
}

function getCubeXML(x, y, z, w, h, d, vOff) {
    const x0 = x - w / 2, x1 = x + w / 2;
    const y0 = y - h / 2, y1 = y + h / 2;
    const z0 = z, z1 = z + d;
    let v = `<vertex x="${x0.toFixed(3)}" y="${y0.toFixed(3)}" z="${z0.toFixed(3)}"/>
<vertex x="${x1.toFixed(3)}" y="${y0.toFixed(3)}" z="${z0.toFixed(3)}"/>
<vertex x="${x1.toFixed(3)}" y="${y1.toFixed(3)}" z="${z0.toFixed(3)}"/>
<vertex x="${x0.toFixed(3)}" y="${y1.toFixed(3)}" z="${z0.toFixed(3)}"/>
<vertex x="${x0.toFixed(3)}" y="${y0.toFixed(3)}" z="${z1.toFixed(3)}"/>
<vertex x="${x1.toFixed(3)}" y="${y0.toFixed(3)}" z="${z1.toFixed(3)}"/>
<vertex x="${x1.toFixed(3)}" y="${y1.toFixed(3)}" z="${z1.toFixed(3)}"/>
<vertex x="${x0.toFixed(3)}" y="${y1.toFixed(3)}" z="${z1.toFixed(3)}"/>
`;
    const tArray = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7];
    let t = '';
    for (let i = 0; i < tArray.length; i += 3) {
        t += `<triangle v1="${tArray[i] + vOff}" v2="${tArray[i + 1] + vOff}" v3="${tArray[i + 2] + vOff}"/>\n`;
    }
    return { v, t };
}

export function generatePlateXML(temp, flow, cx, cy) {
    const vXML = [];
    const tXML = [];
    let vOff = 0;
    const addFastCube = (x, y, z, w, h, d) => {
        const cube = getCubeXML(x, y, z, w, h, d, vOff);
        vXML.push(cube.v);
        tXML.push(cube.t);
        vOff += 8;
    };
    const voxels = generateVoxelText(`T:${temp}C`, `F:${flow}`, 40, 40);
    for (const voxel of voxels) addFastCube(cx + voxel.x, cy + voxel.y, 0, voxel.size, voxel.size, 0.6);
    addFastCube(cx, cy, 0.6, 40, 40, 2);
    return `<mesh>\n<vertices>\n${vXML.join('')}</vertices>\n<triangles>\n${tXML.join('')}</triangles>\n</mesh>`;
}

export function previewCalibrationGrid() {
    clearInnerModel();
    if (refs.crystalBlock) {
        refs.scene.remove(refs.crystalBlock);
        refs.crystalBlock = null;
    }
    const plateGeo = new THREE.BoxGeometry(38, 2, 38);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.7 });
    const textGeo = new THREE.BoxGeometry(20, 0.6, 20);
    const textMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a });
    for (let c = 0; c < 6; c++) {
        for (let r = 0; r < 6; r++) {
            const cx = -105 + c * 42;
            const cy = -105 + r * 42;
            const mesh = new THREE.Mesh(plateGeo, plateMat);
            mesh.position.set(cx, 1.6, cy);
            const textMock = new THREE.Mesh(textGeo, textMat);
            textMock.position.set(cx, 0.3, cy);
            refs.innerModelGroup.add(mesh);
            refs.innerModelGroup.add(textMock);
        }
    }
    refs.camera.position.set(0, -150, 200);
    if (refs.controls) refs.controls.target.set(0, 0, 0);
}

export async function exportCalibration3MF() {
    const minT = parseFloat(document.getElementById('cal-min-t').value);
    const maxT = parseFloat(document.getElementById('cal-max-t').value);
    const minF = parseFloat(document.getElementById('cal-min-f').value);
    const maxF = parseFloat(document.getElementById('cal-max-f').value);

    let resources = `    <basematerials id="1">
      <base name="Clear PLA" displaycolor="#FFFFFF00"/>
    </basematerials>
`;
    let build = '';
    let objId = 2;
    for (let c = 0; c < 6; c++) {
        for (let r = 0; r < 6; r++) {
            const temp = Math.round(minT + c * (maxT - minT) / 5);
            const flow = (minF + r * (maxF - minF) / 5).toFixed(1);
            resources += `    <object id="${objId}" name="T${temp}-F${flow}" type="model" pid="1" pindex="0">
${generatePlateXML(temp, flow, -105 + c * 42, -105 + r * 42)}
    </object>
`;
            build += `    <item objectid="${objId}"/>\n`;
            objId++;
        }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Application">Clear Print Tools Crystal Slicer</metadata>
  <metadata name="Title">Clear Filament Matrix</metadata>
  <resources>
${resources}
  </resources>
  <build>
${build}  </build>
</model>
`;
    return build3mfBlob(xml);
}

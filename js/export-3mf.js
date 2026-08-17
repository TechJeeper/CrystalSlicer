import { JSZip } from './globals.js';
import { PRINT_MIME, refs, state } from './state.js';
import { blockBox, getPrintMatrix, meshTo3mfXml, prepareMeshData } from './geometry.js';
import { getInnerSlicePlaneZ } from './scene.js';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Override PartName="/3D/3dmodel.model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

export async function build3mfBlob(modelXml) {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', CONTENT_TYPES);
    zip.folder('_rels').file('.rels', RELS);
    zip.folder('3D').file('3dmodel.model', modelXml);
    const bytes = await zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    });
    return new Blob([bytes], { type: PRINT_MIME });
}

function wrapModel(title, resourcesXml, buildXml) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Application">Clear Print Tools Crystal Slicer</metadata>
  <metadata name="Title">${title}</metadata>
  <resources>
${resourcesXml}
  </resources>
  <build>
${buildXml}
  </build>
</model>
`;
}

export async function buildCrystalModelXml() {
    if (!refs.crystalBlock || !refs.innerModelGroup) {
        throw new Error('Scene is not ready');
    }
    const printMatrix = getPrintMatrix(state.blockD);
    const clipBox = blockBox(state, 0.02);
    if (state.sliceHalfCenter) {
        const centerSliceZ = getInnerSlicePlaneZ();
        if (centerSliceZ !== null) {
            clipBox.min.z = Math.max(clipBox.min.z, centerSliceZ);
        }
    }

    const blockMesh = await prepareMeshData(refs.crystalBlock, { printMatrix });
    const innerMesh = await prepareMeshData(refs.innerModelGroup, { printMatrix, clipBox });

    if (!blockMesh.triangles.length) throw new Error('Crystal block mesh is empty');
    if (!innerMesh.triangles.length) {
        throw new Error('Embedded model is empty or fully outside the block. Reposition it and try again.');
    }

    const resources = `    <basematerials id="1">
      <base name="Clear PLA" displaycolor="#FFFFFF00"/>
      <base name="Solid Color PLA" displaycolor="#0000FFFF"/>
    </basematerials>
    <object id="2" name="Clear PLA Block" type="model" pid="1" pindex="0">
${meshTo3mfXml(blockMesh.vertices, blockMesh.triangles)}
    </object>
    <object id="3" name="Embedded Model" type="model" pid="1" pindex="1">
${meshTo3mfXml(innerMesh.vertices, innerMesh.triangles)}
    </object>
    <object id="4" name="Crystal Assembly" type="model">
      <components>
        <component objectid="2"/>
        <component objectid="3"/>
      </components>
    </object>`;

    return {
        xml: wrapModel('Crystal Block Assembly', resources, '    <item objectid="4"/>'),
        blockMesh,
        innerMesh
    };
}

export async function exportCrystal3MF() {
    const { xml, blockMesh, innerMesh } = await buildCrystalModelXml();
    const blob = await build3mfBlob(xml);
    return { blob, xml, blockMesh, innerMesh };
}

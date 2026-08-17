import { THREE } from './globals.js';

const WELD_QUANT = 10000;
const MIN_AREA2 = 1e-16;

export function getPrintMatrix(blockD) {
    const matrix = new THREE.Matrix4().makeRotationX(Math.PI);
    matrix.setPosition(0, 0, blockD / 2);
    return matrix;
}

export function blockBox(state, inset = 0) {
    return new THREE.Box3(
        new THREE.Vector3(
            -state.blockW / 2 + inset,
            -state.blockH / 2 + inset,
            -state.blockD / 2 + inset
        ),
        new THREE.Vector3(
            state.blockW / 2 - inset,
            state.blockH / 2 - inset,
            state.blockD / 2 - inset
        )
    );
}

export function bakeWorldGeometry(target) {
    const pieces = [];
    target.updateMatrixWorld(true);
    target.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        const geom = child.geometry.clone();
        geom.applyMatrix4(child.matrixWorld);
        pieces.push(geom);
    });
    if (!pieces.length) return null;
    return mergeToNonIndexed(pieces);
}

function mergeToNonIndexed(geoms) {
    let triCount = 0;
    for (const geom of geoms) {
        const pos = geom.attributes.position;
        if (!pos) continue;
        triCount += geom.index ? geom.index.count : pos.count;
    }
    const positions = new Float32Array(triCount * 3);
    let offset = 0;
    for (const geom of geoms) {
        const pos = geom.attributes.position;
        if (!pos) continue;
        if (geom.index) {
            const idx = geom.index.array;
            for (let i = 0; i < idx.length; i++) {
                const vi = idx[i];
                positions[offset++] = pos.getX(vi);
                positions[offset++] = pos.getY(vi);
                positions[offset++] = pos.getZ(vi);
            }
        } else {
            const arr = pos.array;
            positions.set(arr, offset);
            offset += arr.length;
        }
        geom.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, offset), 3));
    return merged;
}

export function clampGeometryToBox(geometry, box) {
    const pos = geometry.attributes.position;
    const { min, max } = box;
    for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(
            i,
            Math.min(Math.max(pos.getX(i), min.x), max.x),
            Math.min(Math.max(pos.getY(i), min.y), max.y),
            Math.min(Math.max(pos.getZ(i), min.z), max.z)
        );
    }
    pos.needsUpdate = true;
    return geometry;
}

function triangleArea2(a, b, c) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    return cx * cx + cy * cy + cz * cz;
}

export async function weldTriangles(geometry) {
    const pos = geometry.attributes.position;
    const map = new Map();
    const vertices = [];
    const triangles = [];

    const indexOf = (i) => {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const key = `${Math.round(x * WELD_QUANT)}:${Math.round(y * WELD_QUANT)}:${Math.round(z * WELD_QUANT)}`;
        let idx = map.get(key);
        if (idx === undefined) {
            idx = vertices.length;
            vertices.push({ x, y, z });
            map.set(key, idx);
        }
        return idx;
    };

    for (let i = 0; i + 2 < pos.count; i += 3) {
        const a = indexOf(i);
        const b = indexOf(i + 1);
        const c = indexOf(i + 2);
        if (a === b || b === c || a === c) continue;
        if (triangleArea2(vertices[a], vertices[b], vertices[c]) < MIN_AREA2) continue;
        triangles.push([a, b, c]);
        if (triangles.length % 20000 === 0) await Promise.resolve();
    }
    return { vertices, triangles };
}

export function meshBounds(vertices) {
    const bounds = {
        min: { x: Infinity, y: Infinity, z: Infinity },
        max: { x: -Infinity, y: -Infinity, z: -Infinity }
    };
    for (const v of vertices) {
        if (v.x < bounds.min.x) bounds.min.x = v.x;
        if (v.y < bounds.min.y) bounds.min.y = v.y;
        if (v.z < bounds.min.z) bounds.min.z = v.z;
        if (v.x > bounds.max.x) bounds.max.x = v.x;
        if (v.y > bounds.max.y) bounds.max.y = v.y;
        if (v.z > bounds.max.z) bounds.max.z = v.z;
    }
    return bounds;
}

export function meshTo3mfXml(vertices, triangles) {
    const vLines = new Array(vertices.length);
    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        vLines[i] = `        <vertex x="${v.x.toFixed(4)}" y="${v.y.toFixed(4)}" z="${v.z.toFixed(4)}"/>`;
    }
    const tLines = new Array(triangles.length);
    for (let i = 0; i < triangles.length; i++) {
        const t = triangles[i];
        tLines[i] = `        <triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`;
    }
    return [
        '      <mesh>',
        '        <vertices>',
        vLines.join('\n'),
        '        </vertices>',
        '        <triangles>',
        tLines.join('\n'),
        '        </triangles>',
        '      </mesh>'
    ].join('\n');
}

export async function prepareMeshData(target, { printMatrix, clipBox } = {}) {
    const geom = bakeWorldGeometry(target);
    if (!geom) return { vertices: [], triangles: [], bounds: null };
    if (clipBox) clampGeometryToBox(geom, clipBox);
    if (printMatrix) geom.applyMatrix4(printMatrix);
    const welded = await weldTriangles(geom);
    geom.dispose();
    welded.bounds = meshBounds(welded.vertices);
    return welded;
}

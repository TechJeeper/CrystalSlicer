import { THREE } from './globals.js';
import { refs, state } from './state.js';

function makeClipPlanes() {
    const hx = state.blockW / 2;
    const hy = state.blockH / 2;
    const hz = state.blockD / 2;
    return [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), hx),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), hx),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), hy),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), hy),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), hz),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), hz)
    ];
}

export function updateClipPlanes() {
    refs.clipPlanes = makeClipPlanes();
    if (!refs.innerModelGroup) return;
    refs.innerModelGroup.traverse((child) => {
        if (child.isMesh && child.material) {
            child.material.clippingPlanes = refs.clipPlanes;
            child.material.needsUpdate = true;
        }
    });
}

export function createCrystalBlock() {
    if (refs.currentMode !== 'slicer') return;
    if (refs.crystalBlock) refs.scene.remove(refs.crystalBlock);

    const geometry = new THREE.BoxGeometry(state.blockW, state.blockH, state.blockD);
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.1,
        roughness: 0.1,
        transmission: 0.8,
        ior: 1.5,
        transparent: true,
        opacity: 1
    });
    refs.crystalBlock = new THREE.Mesh(geometry, material);
    refs.crystalBlock.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x94a3b8, opacity: 0.5, transparent: true })
    ));
    refs.scene.add(refs.crystalBlock);
    updateClipPlanes();
}

export function clearInnerModel() {
    if (!refs.innerModelGroup) return;
    while (refs.innerModelGroup.children.length > 0) {
        const child = refs.innerModelGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
        }
        refs.innerModelGroup.remove(child);
    }
}

function innerMaterial() {
    return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.45,
        metalness: 0.05,
        clippingPlanes: refs.clipPlanes,
        clipShadows: true
    });
}

export function addInnerGeometry(geometry) {
    geometry.computeVertexNormals();
    refs.innerModelGroup.add(new THREE.Mesh(geometry, innerMaterial()));
}

export function normalizeAndPositionModel() {
    if (!refs.innerModelGroup || refs.innerModelGroup.children.length === 0) return;
    refs.innerModelGroup.scale.set(1, 1, 1);
    refs.innerModelGroup.position.set(0, 0, 0);
    refs.innerModelGroup.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(refs.innerModelGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    refs.innerModelGroup.children.forEach((child) => child.position.sub(center));

    state.baseScale = (Math.min(state.blockW, state.blockH) * 0.8) / Math.max(size.x, size.y, 1e-6);
    const scaledZ = size.z * state.baseScale;
    const maxZ = state.blockD * 0.8;
    state.flattenFit = scaledZ > maxZ ? maxZ / scaledZ : 1;
    applyModelTransforms();
}

export function applyModelTransforms() {
    if (refs.currentMode !== 'slicer' || !refs.innerModelGroup) return;
    const xyScale = state.baseScale * state.modelXYScale;
    const zScale = state.baseScale * state.flattenFit * state.modelZScale;
    refs.innerModelGroup.scale.set(xyScale, xyScale, zScale);
    refs.innerModelGroup.position.set(0, 0, 0);
    refs.innerModelGroup.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(refs.innerModelGroup);
    const size = box.getSize(new THREE.Vector3());
    const maxOffset = Math.max(0, (state.blockD - size.z) / 2 - 0.05);
    const z = THREE.MathUtils.clamp(state.modelZPos, -maxOffset, maxOffset);
    refs.innerModelGroup.position.set(0, 0, z);
}

export function rotateInnerModel(axis) {
    refs.innerModelGroup.scale.set(1, 1, 1);
    refs.innerModelGroup.position.set(0, 0, 0);
    refs.innerModelGroup.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        if (axis === 'x') child.geometry.rotateX(Math.PI / 2);
        if (axis === 'y') child.geometry.rotateY(Math.PI / 2);
        if (axis === 'z') child.geometry.rotateZ(Math.PI / 2);
        child.geometry.center();
    });
    normalizeAndPositionModel();
}

export function loadProceduralBenchy() {
    clearInnerModel();
    const shape = new THREE.Shape();
    shape.moveTo(-15, -10); shape.lineTo(15, -10); shape.bezierCurveTo(25, -10, 25, 5, 12, 5);
    shape.lineTo(8, 5); shape.lineTo(8, 12); shape.lineTo(-2, 12); shape.lineTo(-2, 5); shape.lineTo(-15, 5); shape.lineTo(-15, -10);
    const hole = new THREE.Path();
    hole.moveTo(-1, 6); hole.lineTo(6, 6); hole.lineTo(6, 10); hole.lineTo(-1, 10); hole.lineTo(-1, 6);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 8, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.5, bevelThickness: 0.5
    });
    geometry.center();
    addInnerGeometry(geometry);
    normalizeAndPositionModel();
}

export function loadSampleBenchy() {
    return new Promise((resolve) => {
        const loader = new THREE.STLLoader();
        loader.load('3dbenchy.stl', (geometry) => {
            clearInnerModel();
            geometry.rotateX(-Math.PI / 2);
            geometry.center();
            addInnerGeometry(geometry);
            normalizeAndPositionModel();
            resolve(true);
        }, undefined, () => {
            loadProceduralBenchy();
            resolve(false);
        });
    });
}

export function loadUserModel(file, bufferOrText) {
    clearInnerModel();
    const name = file.name.toLowerCase();
    if (name.endsWith('.stl')) {
        const geometry = new THREE.STLLoader().parse(bufferOrText);
        geometry.rotateX(-Math.PI / 2);
        geometry.computeBoundingBox();
        geometry.center();
        addInnerGeometry(geometry);
    } else {
        const obj = new THREE.OBJLoader().parse(bufferOrText);
        obj.position.sub(new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()));
        obj.traverse((child) => {
            if (child.isMesh) {
                child.material = innerMaterial();
                if (child.geometry) {
                    child.geometry.computeVertexNormals();
                }
            }
        });
        refs.innerModelGroup.add(obj);
    }
    normalizeAndPositionModel();
}

export function initScene(container) {
    refs.scene = new THREE.Scene();
    refs.scene.background = new THREE.Color(0xf1f5f9);

    const gridHelper = new THREE.GridHelper(300, 60, 0x000000, 0x000000);
    gridHelper.material.opacity = 0.08;
    gridHelper.material.transparent = true;
    gridHelper.position.y = -30;
    refs.scene.add(gridHelper);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    refs.camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    refs.camera.position.set(60, 60, 100);

    refs.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    refs.scene.add(dirLight);

    try {
        refs.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        refs.renderer.setSize(width, height);
        refs.renderer.setPixelRatio(window.devicePixelRatio || 1);
        refs.renderer.localClippingEnabled = true;
        container.appendChild(refs.renderer.domElement);
        refs.controls = new THREE.OrbitControls(refs.camera, refs.renderer.domElement);
        refs.controls.enableDamping = true;
        refs.controls.dampingFactor = 0.05;
    } catch (err) {
        console.warn('WebGL preview unavailable; 3MF export still works.', err);
        refs.renderer = null;
        refs.controls = null;
    }

    refs.innerModelGroup = new THREE.Group();
    refs.scene.add(refs.innerModelGroup);
    updateClipPlanes();
    createCrystalBlock();
}

export function onWindowResize() {
    const container = document.getElementById('canvas-container');
    if (!container || !refs.camera || !refs.renderer) return;
    refs.camera.aspect = container.clientWidth / container.clientHeight;
    refs.camera.updateProjectionMatrix();
    refs.renderer.setSize(container.clientWidth, container.clientHeight);
}

export function animate() {
    requestAnimationFrame(animate);
    if (refs.controls) refs.controls.update();
    if (refs.renderer && refs.scene && refs.camera) refs.renderer.render(refs.scene, refs.camera);
}

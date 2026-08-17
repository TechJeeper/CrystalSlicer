import { refs, state } from './state.js';
import {
    animate,
    applyModelTransforms,
    clearInnerModel,
    createCrystalBlock,
    initScene,
    loadSampleBenchy,
    loadUserModel,
    normalizeAndPositionModel,
    onWindowResize,
    rotateInnerModel
} from './scene.js';
import { exportCrystal3MF } from './export-3mf.js';
import { exportCalibration3MF, previewCalibrationGrid } from './calibration.js';
import { resetExportButton, save3mfFile } from './download.js';

function setStatus(message) {
    const overlay = document.getElementById('status-overlay');
    const label = overlay?.querySelector('span');
    if (!overlay || !label) return;
    if (!message) {
        overlay.classList.remove('visible');
        label.textContent = '';
        return;
    }
    label.textContent = message;
    overlay.classList.add('visible');
}

export function switchTab(tabId) {
    refs.currentMode = tabId;
    document.getElementById('tab-slicer').classList.toggle('active', tabId === 'slicer');
    document.getElementById('tab-calib').classList.toggle('active', tabId === 'calib');
    document.getElementById('export-panel-desktop').classList.toggle('active', tabId === 'slicer');
    document.getElementById('calib-export-panel-desktop').classList.toggle('active', tabId === 'calib');

    const btnSlicer = document.getElementById('nav-slicer');
    const btnCalib = document.getElementById('nav-calib');
    const active = 'px-3 md:px-4 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium bg-slate-200 text-slate-800 transition-colors';
    const idle = 'px-3 md:px-4 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium hover:bg-slate-100 text-slate-600 transition-colors';

    if (tabId === 'slicer') {
        btnSlicer.className = active;
        btnCalib.className = idle;
        createCrystalBlock();
        restoreSlicerModel();
        refs.camera.position.set(60, 60, 100);
    } else {
        btnCalib.className = active;
        btnSlicer.className = idle;
        previewCalibrationGrid();
    }
    refs.controls?.target.set(0, 0, 0);
}

function bindSlider(id, prop, onChange) {
    document.getElementById(`slider-${id}`).addEventListener('input', (e) => {
        state[prop] = parseFloat(e.target.value);
        const suffix = id.includes('scale') ? 'x' : 'mm';
        document.getElementById(`val-${id}`).innerText = e.target.value + suffix;
        onChange();
    });
}

function setupUIEventListeners() {
    document.getElementById('file-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const textSpan = document.getElementById('upload-btn-text');
        textSpan.innerText = 'Parsing File...';
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                loadUserModel(file, evt.target.result);
                state.lastUserFile = file;
                textSpan.innerText = 'Model Loaded! Upload another?';
            } catch (err) {
                alert('Error reading 3D file. Ensure it is a valid STL or OBJ.');
                textSpan.innerText = 'Upload STL or OBJ';
            } finally {
                e.target.value = '';
            }
        };
        if (file.name.toLowerCase().endsWith('.stl')) reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    });

    bindSlider('block-w', 'blockW', () => { createCrystalBlock(); normalizeAndPositionModel(); });
    bindSlider('block-h', 'blockH', () => { createCrystalBlock(); normalizeAndPositionModel(); });
    bindSlider('block-d', 'blockD', () => { createCrystalBlock(); normalizeAndPositionModel(); });
    bindSlider('z-scale', 'modelZScale', applyModelTransforms);
    bindSlider('xy-scale', 'modelXYScale', applyModelTransforms);
    bindSlider('z-pos', 'modelZPos', applyModelTransforms);

    document.querySelectorAll('[data-rotate]').forEach((btn) => {
        btn.addEventListener('click', () => rotateInnerModel(btn.dataset.rotate));
    });
    document.getElementById('nav-slicer').addEventListener('click', () => switchTab('slicer'));
    document.getElementById('nav-calib').addEventListener('click', () => switchTab('calib'));
    document.getElementById('btn-preview-calib').addEventListener('click', previewCalibrationGrid);

    wireExportButton('btn-export-slicer-desk', exportSlicer, 'Download 3MF', 'bg-blue-600 hover:bg-blue-700');
    wireExportButton('btn-export-slicer-mob', exportSlicer, 'Download 3MF', 'bg-blue-600 hover:bg-blue-700');
    wireExportButton('btn-export-calib-desk', exportCalib, 'Generate Matrix', 'bg-indigo-600 hover:bg-indigo-700');
    wireExportButton('btn-export-calib-mob', exportCalib, 'Generate Matrix', 'bg-indigo-600 hover:bg-indigo-700');
}

async function restoreSlicerModel() {
    clearInnerModel();
    if (state.lastUserFile) {
        const file = state.lastUserFile;
        const data = file.name.toLowerCase().endsWith('.stl') ? await file.arrayBuffer() : await file.text();
        loadUserModel(file, data);
        return;
    }
    await loadSampleBenchy();
}

function wireExportButton(id, handler, resetLabel, colorClass) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', (event) => handler(event, btn, resetLabel, colorClass));
}

async function exportSlicer(event, btn, resetLabel, colorClass) {
    event.preventDefault();
    btn.querySelector('span').innerText = 'Crunching...';
    btn.classList.add('opacity-75');
    setStatus('Building universal 3MF…');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
        const result = await save3mfFile('crystal_block_facedown.3mf', async () => {
            const out = await exportCrystal3MF();
            return out.blob;
        });
        if (result.cancelled) {
            resetExportButton(btn, resetLabel, colorClass);
            return;
        }
        btn.classList.remove('opacity-75', 'bg-blue-600', 'hover:bg-blue-700');
        btn.classList.add('bg-green-600', 'hover:bg-green-700');
        btn.querySelector('span').innerText = result.url ? 'Saved — click again if needed' : 'Saved 3MF';
        setTimeout(() => resetExportButton(btn, resetLabel, colorClass), 2500);
    } catch (err) {
        alert('Export Error: ' + err.message);
        resetExportButton(btn, resetLabel, colorClass);
    } finally {
        setStatus('');
    }
}

async function exportCalib(event, btn, resetLabel, colorClass) {
    event.preventDefault();
    btn.querySelector('span').innerText = 'Crunching...';
    btn.classList.add('opacity-75');
    setStatus('Building calibration 3MF…');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
        const result = await save3mfFile('clear_filament_matrix.3mf', exportCalibration3MF);
        if (result.cancelled) {
            resetExportButton(btn, resetLabel, colorClass);
            return;
        }
        btn.classList.remove('opacity-75', 'bg-indigo-600', 'hover:bg-indigo-700');
        btn.classList.add('bg-green-600', 'hover:bg-green-700');
        btn.querySelector('span').innerText = result.url ? 'Saved — click again if needed' : 'Saved 3MF';
        setTimeout(() => resetExportButton(btn, resetLabel, colorClass), 2500);
    } catch (err) {
        alert('Export Error: ' + err.message);
        resetExportButton(btn, resetLabel, colorClass);
    } finally {
        setStatus('');
    }
}

async function init() {
    const container = document.getElementById('canvas-container');
    initScene(container);
    setupUIEventListeners();
    window.addEventListener('resize', onWindowResize);
    animate();
    setStatus('Loading 3D Benchy sample…');
    await loadSampleBenchy();
    setStatus('');
    window.__crystal = {
        exportCrystal3MF,
        exportCalibration3MF,
        state,
        refs
    };
    window.__crystalReady = true;
}

init();

import { PRINT_MIME } from './state.js';

export async function save3mfFile(filename, getBlob) {
    let handle = null;
    if (typeof window.showSaveFilePicker === 'function' && !window.__crystalSkipPicker) {
        try {
            handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: '3MF Model', accept: { [PRINT_MIME]: ['.3mf'] } }]
            });
        } catch (err) {
            if (err.name === 'AbortError') return { cancelled: true };
        }
    }

    const blob = await getBlob();
    const file = new File([blob], filename, { type: PRINT_MIME });

    if (handle) {
        const writable = await handle.createWritable();
        await writable.write(file);
        await writable.close();
        return { saved: true, file };
    }

    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { saved: true, file, url };
}

export function resetExportButton(btn, label, colorClass) {
    btn.removeAttribute('download');
    if (btn.tagName === 'A') btn.setAttribute('href', 'javascript:void(0)');
    btn.classList.remove('bg-green-600', 'hover:bg-green-700', 'opacity-75');
    btn.classList.add(...colorClass.split(' '));
    const span = btn.querySelector('span');
    if (span) span.innerText = label;
}

// src/main/preview/persist.ts — where a file's translations live (LS-12 §1.4, D1/D2).
//
// clientStorage is plugin-scoped, not file-scoped, so the store is keyed by a random id stamped once
// on the document. The id is the only thing Preview writes to the file outside its text layers, and
// it is written on the first SAVE — merely opening the panel never touches the file.
import { emptyStore, parseStore, type PreviewStore } from './store';

export const PREVIEW_FILE_ID_KEY = 'localesync:file-id:v1';

export function storeKeyFor(fileId: string): string {
	return `localesync:preview:v1:${fileId}`;
}

function existingFileId(): string | null {
	const id = figma.root.getPluginData(PREVIEW_FILE_ID_KEY);
	return id === '' ? null : id;
}

function ensureFileId(): string {
	const existing = existingFileId();
	if (existing !== null) return existing;
	// No `crypto` on the main thread; uniqueness across one user's files is all this needs.
	let id = '';
	for (let i = 0; i < 16; i++) id += Math.floor(Math.random() * 16).toString(16);
	figma.root.setPluginData(PREVIEW_FILE_ID_KEY, id);
	return id;
}

export async function loadStore(): Promise<PreviewStore> {
	const id = existingFileId();
	if (id === null) return emptyStore();
	return parseStore(await figma.clientStorage.getAsync(storeKeyFor(id)));
}

/** Throws when clientStorage refuses the write; the caller maps that to `storage-failed`. */
export async function saveStore(store: PreviewStore): Promise<void> {
	await figma.clientStorage.setAsync(storeKeyFor(ensureFileId()), store);
}

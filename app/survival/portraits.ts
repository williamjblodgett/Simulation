let portraits: Readonly<Record<string, string>> = {};
const empty: Readonly<Record<string, string>> = {};
const listeners = new Set<() => void>();
export const getPortraits = () => portraits;
export const getServerPortraits = () => empty;
export const subscribePortraits = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function publishPortraits(images: Record<string, string>) { portraits = images; listeners.forEach(listener => listener()); }

let habitatPreview: string | null = null;
const previewListeners = new Set<() => void>();
export const getHabitatPreview = () => habitatPreview;
export const getServerHabitatPreview = () => null;
export const subscribeHabitatPreview = (listener: () => void) => { previewListeners.add(listener); return () => { previewListeners.delete(listener); }; };
export function publishHabitatPreview(image: string) { habitatPreview = image; previewListeners.forEach(listener => listener()); }

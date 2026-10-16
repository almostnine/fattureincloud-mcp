declare const __VERSION__: string | undefined;

/** Versione iniettata da esbuild in fase di build; in sviluppo e nei test vale "dev". */
export const VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

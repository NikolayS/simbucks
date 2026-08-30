import { registerHooks } from 'node:module';
const VENDOR = new URL('../vendor/three.module.js', import.meta.url).href;
const ADDONS = new URL('../vendor/addons/', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'three') return { url: VENDOR, shortCircuit: true };
    if (specifier.startsWith('three/addons/')) return { url: ADDONS + specifier.slice('three/addons/'.length), shortCircuit: true };
    return next(specifier, context);
  },
});

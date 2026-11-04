import { registerHooks } from 'node:module';
// Resolve project TypeScript imports without a separate bundler process (Node 24+).
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try {
        return next(`${specifier}.ts`, context);
      } catch (error) {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      }
    }
    return next(specifier, context);
  },
});

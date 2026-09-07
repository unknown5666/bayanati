// Minimal type shim for the untyped `arabic-reshaper` package.
declare module 'arabic-reshaper' {
  export function reshape(input: string): string;
  const _default: { reshape: (input: string) => string };
  export default _default;
}

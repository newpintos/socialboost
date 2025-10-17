// Type definition for clsx
declare module 'clsx' {
  export type ClassValue = string | number | ClassDictionary | ClassArray | undefined | null | boolean;
  export interface ClassDictionary {
    [id: string]: any;
  }
  export interface ClassArray extends Array<ClassValue> {}
  export function clsx(...inputs: ClassValue[]): string;
  export default clsx;
}

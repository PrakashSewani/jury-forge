export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .join(' ');
}

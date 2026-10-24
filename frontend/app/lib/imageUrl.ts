export function isAllowedImageUrl(value: string): boolean {
  if (!value) return true
  if (/\s/.test(value)) return false
  if (value.startsWith('https://')) return true
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('..')) return true
  return false
}

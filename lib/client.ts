'use client'

/** Thin fetch wrappers that surface the API's error message instead of a bare status. */
export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Something went wrong.')
  return body as T
}

export async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Something went wrong.')
  return body as T
}

export async function postForm<T>(url: string, form: FormData): Promise<T> {
  const response = await fetch(url, { method: 'POST', body: form })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Something went wrong.')
  return body as T
}

export async function downloadCsv(url: string, filename: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Could not build the export.')
  const blob = await response.blob()
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

// Override with VITE_API_URL (e.g. in Vercel env vars) when the tunnel URL changes.
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'https://deskwork-scalded-reshape.ngrok-free.dev').replace(/\/$/, '')

// ngrok's free-tier interstitial is only skipped by this request HEADER (the query param is ignored by browsers).
const NGROK_HEADERS = { 'ngrok-skip-browser-warning': '1' }

function apiUrl(path) {
  return `${API_BASE_URL}${path}`
}

function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), { ...options, headers: { ...NGROK_HEADERS, ...options.headers } })
}

export async function compressImageFile(file, { maxDimension = 1400, quality = 0.78 } = {}) {
  if (!file) throw new Error('الصورة مطلوبة.')

  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('تعذر قراءة الصورة.'))
      element.src = sourceUrl
    })

    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) throw new Error('تعذر ضغط الصورة.')

    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'image'
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

async function request(path, options = {}) {
  const response = await apiFetch(path, options)
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message = typeof body === 'object' && body?.detail
      ? body.detail
      : `فشل طلب الخادم (${response.status})`
    throw new Error(message)
  }

  return body
}

export async function getStatus() {
  return request('/api/status')
}

export async function getCatalog() {
  return request('/api/catalog')
}

// <img src> cannot send headers, so stock images are fetched as blobs and shown via object URLs.
export async function getStockImage(file, thumbnail = 220) {
  const response = await apiFetch(`/stock/${encodeURIComponent(file)}?thumb=${thumbnail}`)
  if (!response.ok) throw new Error(`stock image ${response.status}`)
  return URL.createObjectURL(await response.blob())
}

export async function createFittingJob({ personFile, garmentId, garmentFile, category = 'tops', garmentType = 'flat-lay', mode = 'quality' }) {
  if (!personFile) throw new Error('صورة الشخص مطلوبة.')
  if (!garmentId && !garmentFile) throw new Error('اختر قطعة من الموقع أو ارفع صورة ملابس.')

  const formData = new FormData()
  formData.append('person_file', personFile)
  if (garmentId) formData.append('garment_id', garmentId)
  if (garmentFile) formData.append('garment_file', garmentFile)
  formData.append('category', category)
  formData.append('garment_type', garmentType)
  formData.append('mode', mode)

  return request('/api/jobs', { method: 'POST', body: formData })
}

export async function getJobStatus(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}`)
}

export async function getJobResult(jobId) {
  const response = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/result`)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `تعذر تحميل النتيجة (${response.status})`)
  }
  return response.blob()
}

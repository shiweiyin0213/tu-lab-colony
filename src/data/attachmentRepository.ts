import type { LitterAttachmentMetadata } from '../domain/colony'

const databaseName = 'tu-lab-colony-files'
const storeName = 'attachments'
const maxBytes = 20 * 1024 * 1024
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'])
const memoryStore = new Map<string, StoredAttachment>()

interface StoredAttachment {
  metadata: LitterAttachmentMetadata
  blob: Blob
}

export function validateAttachment(file: File) {
  const errors: string[] = []
  if (!allowedTypes.has(file.type)) {
    errors.push('File must be JPEG, PNG, HEIC, or PDF.')
  }
  if (file.size > maxBytes) {
    errors.push('File must be 20 MB or smaller.')
  }
  return errors
}

export async function saveAttachment(
  file: File,
  category: LitterAttachmentMetadata['category'] = 'gel-image',
): Promise<LitterAttachmentMetadata> {
  const errors = validateAttachment(file)
  if (errors.length) {
    throw new Error(errors.join('\n'))
  }

  const metadata: LitterAttachmentMetadata = {
    id: `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    category,
    originalName: file.name,
    mimeType: file.type,
    byteSize: file.size,
    uploaderLabel: 'Local demo user',
    createdAt: new Date().toISOString(),
  }
  const entry = { metadata, blob: file }

  if (!hasIndexedDb()) {
    memoryStore.set(metadata.id, entry)
    return metadata
  }

  const db = await openDatabase()
  await requestToPromise(db.transaction(storeName, 'readwrite').objectStore(storeName).put(entry, metadata.id))
  db.close()
  return metadata
}

export async function readAttachment(id: string): Promise<Blob | undefined> {
  if (!hasIndexedDb()) {
    return memoryStore.get(id)?.blob
  }

  const db = await openDatabase()
  const entry = await requestToPromise<StoredAttachment | undefined>(
    db.transaction(storeName, 'readonly').objectStore(storeName).get(id),
  )
  db.close()
  return entry?.blob
}

export async function deleteAttachment(id: string) {
  if (!hasIndexedDb()) {
    memoryStore.delete(id)
    return
  }

  const db = await openDatabase()
  await requestToPromise(db.transaction(storeName, 'readwrite').objectStore(storeName).delete(id))
  db.close()
}

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestToPromise<T = unknown>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

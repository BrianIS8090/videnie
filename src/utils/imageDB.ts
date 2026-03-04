// IndexedDB для хранения метаданных и OPFS для хранения тяжелых файлов изображений
const DB_NAME = 'lumigen-db'
const STORE_NAME = 'generated-images'
const DB_VERSION = 1
const MAX_STORED_IMAGES = 300
const OPFS_FILE_PREFIX = 'generated-image-'

type ImageStorageType = 'inline' | 'opfs'

export interface StoredImage {
  id: string
  url: string // data URL, blob URL или обычный URL
  prompt: string
  timestamp: number
  cost?: number | null
  generationId?: string | null
  model?: string | null
  tokens?: {
    prompt: number
    completion: number
    total: number
  } | null
  aspectRatio?: string | null
  imageSize?: string | null
  temperature?: number | null
  thinkingLevel?: string | null
  storageType?: ImageStorageType
  opfsFileName?: string | null
}

function isOpfsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'
}

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (!isOpfsSupported()) {
    return null
  }

  try {
    return await navigator.storage.getDirectory()
  } catch (error) {
    console.warn('OPFS недоступен, используем fallback:', error)
    return null
  }
}

async function writeBlobToOpfs(fileName: string, blob: Blob): Promise<boolean> {
  const root = await getOpfsRoot()
  if (!root) {
    return false
  }

  try {
    const fileHandle = await root.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    return true
  } catch (error) {
    console.warn('Не удалось записать файл в OPFS:', error)
    return false
  }
}

async function readObjectUrlFromOpfs(fileName: string): Promise<string | null> {
  const root = await getOpfsRoot()
  if (!root) {
    return null
  }

  try {
    const fileHandle = await root.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    return URL.createObjectURL(file)
  } catch (error) {
    console.warn('Не удалось прочитать файл из OPFS:', error)
    return null
  }
}

async function deleteOpfsFile(fileName?: string | null): Promise<void> {
  if (!fileName) {
    return
  }

  const root = await getOpfsRoot()
  if (!root) {
    return
  }

  try {
    await root.removeEntry(fileName)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return
    }
    console.warn('Не удалось удалить файл из OPFS:', error)
  }
}

async function toBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Не удалось получить Blob из URL: ${response.status}`)
  }
  return await response.blob()
}

async function maybePersistInOpfs(image: StoredImage): Promise<StoredImage> {
  if (!isOpfsSupported()) {
    return {
      ...image,
      storageType: 'inline',
      opfsFileName: null,
    }
  }

  try {
    const blob = await toBlob(image.url)
    const fileName = `${OPFS_FILE_PREFIX}${image.id}`
    const saved = await writeBlobToOpfs(fileName, blob)

    if (!saved) {
      return {
        ...image,
        storageType: 'inline',
        opfsFileName: null,
      }
    }

    return {
      ...image,
      url: '',
      storageType: 'opfs',
      opfsFileName: fileName,
    }
  } catch (error) {
    console.warn('Не удалось перенести изображение в OPFS, используем inline:', error)
    return {
      ...image,
      storageType: 'inline',
      opfsFileName: null,
    }
  }
}

async function hydrateImageUrl(image: StoredImage): Promise<StoredImage | null> {
  if (image.storageType === 'opfs' && image.opfsFileName) {
    const objectUrl = await readObjectUrlFromOpfs(image.opfsFileName)

    if (!objectUrl) {
      return image.url ? image : null
    }

    return {
      ...image,
      url: objectUrl,
    }
  }

  return image.url ? image : null
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
  })
}

function getCount(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.count()

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getOldestImage(db: IDBDatabase): Promise<StoredImage | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('timestamp')
    const request = index.openCursor()

    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(null)
        return
      }

      resolve(cursor.value as StoredImage)
    }

    request.onerror = () => reject(request.error)
  })
}

function deleteById(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function enforceLimit(db: IDBDatabase): Promise<void> {
  const count = await getCount(db)
  if (count < MAX_STORED_IMAGES) {
    return
  }

  const oldest = await getOldestImage(db)
  if (!oldest) {
    return
  }

  await deleteById(db, oldest.id)
  await deleteOpfsFile(oldest.opfsFileName)
}

// Сохранить изображение
export async function saveImage(image: StoredImage): Promise<void> {
  const db = await openDB()
  await enforceLimit(db)

  const prepared = await maybePersistInOpfs(image)

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(prepared)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Получить все изображения (сортировка по времени, новые сверху)
export async function getAllImages(limit?: number, offset?: number): Promise<StoredImage[]> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('timestamp')
    const request = index.openCursor(null, 'prev')
    const results: StoredImage[] = []
    let count = 0

    request.onsuccess = () => {
      const cursor = request.result

      if (cursor) {
        if (offset && count < offset) {
          count++
          cursor.continue()
          return
        }

        if (limit && results.length >= limit) {
          void Promise.all(results.map((image) => hydrateImageUrl(image)))
            .then((hydrated) => {
              resolve(hydrated.filter((image): image is StoredImage => image !== null))
            })
            .catch(reject)
          return
        }

        results.push(cursor.value as StoredImage)
        count++
        cursor.continue()
      } else {
        void Promise.all(results.map((image) => hydrateImageUrl(image)))
          .then((hydrated) => {
            resolve(hydrated.filter((image): image is StoredImage => image !== null))
          })
          .catch(reject)
      }
    }

    request.onerror = () => reject(request.error)
  })
}

// Получить количество изображений
export async function getImagesCount(): Promise<number> {
  const db = await openDB()
  return await getCount(db)
}

function getById(db: IDBDatabase, id: string): Promise<StoredImage | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onsuccess = () => resolve((request.result as StoredImage | undefined) ?? null)
    request.onerror = () => reject(request.error)
  })
}

// Удалить изображение
export async function deleteImage(id: string): Promise<void> {
  const db = await openDB()
  const existing = await getById(db, id)

  await deleteById(db, id)
  await deleteOpfsFile(existing?.opfsFileName)
}

function getAllStored(db: IDBDatabase): Promise<StoredImage[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => resolve((request.result as StoredImage[]) ?? [])
    request.onerror = () => reject(request.error)
  })
}

// Очистить все изображения
export async function clearAllImages(): Promise<void> {
  const db = await openDB()
  const allImages = await getAllStored(db)

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.clear()

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })

  await Promise.all(allImages.map((image) => deleteOpfsFile(image.opfsFileName)))
}

// Получить общую стоимость всех изображений
export async function getTotalCost(): Promise<number> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.openCursor()
    let totalCost = 0

    request.onsuccess = () => {
      const cursor = request.result

      if (cursor) {
        const image = cursor.value as StoredImage
        if (image.cost !== undefined && image.cost !== null) {
          totalCost += image.cost
        }
        cursor.continue()
      } else {
        resolve(totalCost)
      }
    }

    request.onerror = () => reject(request.error)
  })
}

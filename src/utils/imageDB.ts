// IndexedDB для хранения сгенерированных изображений
const DB_NAME = 'lumigen-db'
const STORE_NAME = 'generated-images'
const DB_VERSION = 1

export interface StoredImage {
  id: string
  url: string // data URL или blob URL
  prompt: string
  timestamp: number
  cost?: number | null
  generationId?: string | null
  tokens?: {
    prompt: number
    completion: number
    total: number
  } | null
  aspectRatio?: string | null
  imageSize?: string | null
  temperature?: number | null
  thinkingLevel?: string | null
}

// Открыть/создать базу данных
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      
      // Создать object store если его нет
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
  })
}

// Сохранить изображение
export async function saveImage(image: StoredImage): Promise<void> {
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(image)

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
    
    // Открываем курсор в обратном порядке (новые сверху)
    const request = index.openCursor(null, 'prev')
    const results: StoredImage[] = []
    let count = 0

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result
      
      if (cursor) {
        // Skip offset
        if (offset && count < offset) {
          count++
          cursor.continue()
          return
        }
        
        // Check limit
        if (limit && results.length >= limit) {
          resolve(results)
          return
        }
        
        results.push(cursor.value)
        count++
        cursor.continue()
      } else {
        resolve(results)
      }
    }

    request.onerror = () => reject(request.error)
  })
}

// Получить количество изображений
export async function getImagesCount(): Promise<number> {
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.count()

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Удалить изображение
export async function deleteImage(id: string): Promise<void> {
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Очистить все изображения
export async function clearAllImages(): Promise<void> {
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.clear()

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Получить общую стоимость всех изображений
export async function getTotalCost(): Promise<number> {
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.openCursor()
    
    let totalCost = 0

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result
      
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

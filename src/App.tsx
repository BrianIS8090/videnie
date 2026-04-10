import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowDownToLine, ImagePlus, X, LoaderCircle, KeyRound, SendHorizontal, Paperclip, Trash2, ChevronDown, WandSparkles, Cpu, Ratio, Maximize, Check, Sun, Moon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { saveImage, getAllImages, clearAllImages, getImagesCount, getTotalCost, deleteImage } from './utils/imageDB'
import './index.css'

const MODELS = [
  { id: 'google/gemini-3-pro-image-preview', name: 'Nano Banana Pro (Рекомендуется)' },
  { id: 'google/gemini-3.1-flash-image-preview', name: 'Nano Banana 2' },
  { id: 'google/gemini-2.5-flash-image', name: 'Nano Banana Legacy' },
]

// Все форматы (14 штук для Flash 3.1)
const ALL_ASPECT_RATIOS = [
  { id: '1:1', name: 'Квадрат (1:1)' },
  { id: '16:9', name: 'Широкий (16:9)' },
  { id: '9:16', name: 'Вертикальный (9:16)' },
  { id: '4:3', name: 'Классический (4:3)' },
  { id: '3:4', name: 'Портрет (3:4)' },
  { id: '3:2', name: 'Фото (3:2)' },
  { id: '2:3', name: 'Книга (2:3)' },
  { id: '5:4', name: 'Монитор (5:4)' },
  { id: '4:5', name: 'Соцсети (4:5)' },
  { id: '21:9', name: 'Кинематограф (21:9)' },
  { id: '1:4', name: 'Узкий (1:4)' },
  { id: '4:1', name: 'Баннер (4:1)' },
  { id: '1:8', name: 'Сверхузкий (1:8)' },
  { id: '8:1', name: 'Сверхширокий (8:1)' },
]

// Стандартные 10 форматов (без 1:4, 4:1, 1:8, 8:1)
const STANDARD_RATIOS = ALL_ASPECT_RATIOS.slice(0, 10).map(r => r.id)
// 12 форматов для Pro (без 1:8, 8:1)
const PRO_RATIOS = ALL_ASPECT_RATIOS.filter(r => r.id !== '1:8' && r.id !== '8:1').map(r => r.id)
// Все 14 для Flash 3.1
const FLASH_RATIOS = ALL_ASPECT_RATIOS.map(r => r.id)

// Используется для отображения в дропдауне
const ASPECT_RATIOS = ALL_ASPECT_RATIOS

const IMAGE_SIZES = [
  { id: '0.5K', name: '0.5K — Быстрый' },
  { id: '1K', name: '1K — Стандарт' },
  { id: '2K', name: '2K — Высокое' },
  { id: '4K', name: '4K — Максимум' },
]

// Системный промпт — гарантирует генерацию изображения
const SYSTEM_PROMPT = 'You are an image generation AI. You MUST always respond with a generated image. Never respond with only text. Never refuse to generate an image. If the user provides a reference image, edit or transform it according to their instructions and return the result as an image.'

interface ModelCapabilities {
  imageSizes: string[]
  aspectRatios: string[]
  supportsThinkingLevel: boolean
}

const DEFAULT_MODEL_CAPABILITIES: ModelCapabilities = {
  imageSizes: ['1K'],
  aspectRatios: STANDARD_RATIOS,
  supportsThinkingLevel: false,
}

const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // Pro: 1K/2K/4K, 12 форматов, thinking mandatory (не управляем)
  'google/gemini-3-pro-image-preview': {
    imageSizes: ['1K', '2K', '4K'],
    aspectRatios: PRO_RATIOS,
    supportsThinkingLevel: false,
  },
  // Flash 3.1: 512/1K/2K/4K, все 14 форматов, thinking configurable
  'google/gemini-3.1-flash-image-preview': {
    imageSizes: ['0.5K', '1K', '2K', '4K'],
    aspectRatios: FLASH_RATIOS,
    supportsThinkingLevel: true,
  },
  // Legacy 2.5: только 1K, стандартные 10 форматов, без thinking
  'google/gemini-2.5-flash-image': {
    imageSizes: ['1K'],
    aspectRatios: STANDARD_RATIOS,
    supportsThinkingLevel: false,
  },
}

type MessageContentPart =
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'text'; text: string }

interface OpenRouterMessage {
  role: 'user' | 'system'
  content: string | MessageContentPart[]
}

interface GeneratedImage {
  id: string
  url: string
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
  resolution?: string | null
}

interface SourceImage {
  id: string
  file: File
  preview: string
}

// Примеры промтов для пустого состояния
const PROMPT_EXAMPLES = [
  { icon: '💡', text: 'Designer lamp with black body, two glowing rings in gold color, warm light, studio lighting' },
  { icon: '🎨', text: 'Professional portrait of a woman, soft studio lighting, warm skin tones, blurred background' },
  { icon: '🌲', text: 'Mystical forest with glowing mushrooms, fog, bioluminescent plants, fantasy style' },
  { icon: '📦', text: 'Product photography of modern headphones on gradient background, commercial style' },
]

function App() {
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id)
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [imageSize, setImageSize] = useState('1K')
  const [thinkingLevel, setThinkingLevel] = useState('minimal')
  const [sourceImages, setSourceImages] = useState<SourceImage[]>([])
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingImages, setIsLoadingImages] = useState(false)
  const [totalImagesCount, setTotalImagesCount] = useState(0)
  const [hasMoreImages, setHasMoreImages] = useState(true)
  const [totalCost, setTotalCost] = useState(0)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [tempApiKey, setTempApiKey] = useState('')
  const [showParams, setShowParams] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<'model' | 'ratio' | 'size' | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('videnie_theme') as 'dark' | 'light') || 'dark'
  })
  const dropdownAreaRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previousImageUrlsRef = useRef<Map<string, string>>(new Map())
  const [prompt, setPrompt] = useState('')
  const currentModelCapabilities = MODEL_CAPABILITIES[selectedModel] ?? DEFAULT_MODEL_CAPABILITIES

  // Применение темы
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('videnie_theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  // Закрытие дропдауна при клике вне области
  useEffect(() => {
    if (!openDropdown) return
    const handler = (e: MouseEvent) => {
      if (dropdownAreaRef.current && !dropdownAreaRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openDropdown])

  const revokeObjectUrl = (url: string) => {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  }

  // Загрузка API ключа из localStorage при старте
  useEffect(() => {
    const savedApiKey = localStorage.getItem('openrouter_api_key')
    if (savedApiKey) {
      setApiKey(savedApiKey)
      setTempApiKey(savedApiKey)
    }
  }, [])

  // Авто-увеличение textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [prompt])

  // Загрузка изображений из IndexedDB при старте
  useEffect(() => {
    loadInitialImages()
  }, [])

  useEffect(() => {
    if (!currentModelCapabilities.imageSizes.includes(imageSize)) {
      setImageSize(currentModelCapabilities.imageSizes[0] ?? '1K')
    }

    if (!currentModelCapabilities.aspectRatios.includes(aspectRatio)) {
      setAspectRatio(currentModelCapabilities.aspectRatios[0] ?? '1:1')
    }

    if (!currentModelCapabilities.supportsThinkingLevel && thinkingLevel !== 'minimal') {
      setThinkingLevel('minimal')
    }
  }, [selectedModel, imageSize, aspectRatio, thinkingLevel, currentModelCapabilities])

  useEffect(() => {
    const previousMap = previousImageUrlsRef.current
    const nextMap = new Map(generatedImages.map((img) => [img.id, img.url]))

    previousMap.forEach((url, id) => {
      const nextUrl = nextMap.get(id)
      if (!nextUrl || nextUrl !== url) {
        revokeObjectUrl(url)
      }
    })

    previousImageUrlsRef.current = nextMap
  }, [generatedImages])

  useEffect(() => {
    return () => {
      previousImageUrlsRef.current.forEach((url) => {
        revokeObjectUrl(url)
      })
      previousImageUrlsRef.current.clear()
    }
  }, [])

  const loadInitialImages = async () => {
    try {
      setIsLoadingImages(true)
      const count = await getImagesCount()
      setTotalImagesCount(count)

      const cost = await getTotalCost()
      setTotalCost(cost)

      const images = await getAllImages(20, 0)
      setGeneratedImages(images)
      setHasMoreImages(images.length < count)
    } catch (error) {
      console.error('Ошибка загрузки изображений:', error)
    } finally {
      setIsLoadingImages(false)
    }
  }

  const loadMoreImages = useCallback(async () => {
    if (isLoadingImages || !hasMoreImages) return

    try {
      setIsLoadingImages(true)
      const offset = generatedImages.length
      const images = await getAllImages(20, offset)

      setGeneratedImages(prev => [...prev, ...images])
      setHasMoreImages(generatedImages.length + images.length < totalImagesCount)
    } catch (error) {
      console.error('Ошибка загрузки изображений:', error)
    } finally {
      setIsLoadingImages(false)
    }
  }, [isLoadingImages, hasMoreImages, generatedImages.length, totalImagesCount])

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight
      const scrollTop = document.documentElement.scrollTop
      const clientHeight = document.documentElement.clientHeight

      if (scrollTop + clientHeight >= scrollHeight - 500 && !isLoadingImages && hasMoreImages) {
        loadMoreImages()
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isLoadingImages, hasMoreImages, generatedImages.length, loadMoreImages])

  const handleClearHistory = async () => {
    if (!confirm('Удалить все сгенерированные изображения? Это действие нельзя отменить.')) {
      return
    }

    try {
      await clearAllImages()
      setGeneratedImages((prev) => {
        prev.forEach((img) => revokeObjectUrl(img.url))
        return []
      })
      setTotalImagesCount(0)
      setTotalCost(0)
      setHasMoreImages(false)
      alert('История очищена')
    } catch (error) {
      console.error('Ошибка очистки истории:', error)
      alert('Ошибка при очистке истории')
    }
  }

  const handleDeleteImage = async (img: GeneratedImage) => {
    try {
      await deleteImage(img.id)

      revokeObjectUrl(img.url)

      setGeneratedImages(prev => prev.filter(i => i.id !== img.id))
      setTotalImagesCount(prev => prev - 1)

      if (img.cost !== undefined && img.cost !== null) {
        setTotalCost(prev => prev - img.cost!)
      }
    } catch (error) {
      console.error('Ошибка удаления изображения:', error)
      alert('Ошибка при удалении изображения')
    }
  }

  const addGeneratedImage = async (imageData: {
    url: string
    prompt: string
    cost?: number | null
    generationId?: string | null
    model?: string | null
    tokens?: { prompt: number; completion: number; total: number } | null
    aspectRatio?: string | null
    imageSize?: string | null
    temperature?: number | null
    thinkingLevel?: string | null
    resolution?: string | null
  }) => {
    const newImage: GeneratedImage = {
      id: Math.random().toString(36).substr(2, 9),
      url: imageData.url,
      prompt: imageData.prompt,
      timestamp: Date.now(),
      cost: imageData.cost,
      generationId: imageData.generationId,
      model: imageData.model,
      tokens: imageData.tokens,
      aspectRatio: imageData.aspectRatio,
      imageSize: imageData.imageSize,
      temperature: imageData.temperature,
      thinkingLevel: imageData.thinkingLevel,
      resolution: imageData.resolution
    }

    setGeneratedImages(prev => [newImage, ...prev])
    setTotalImagesCount(prev => prev + 1)

    if (imageData.cost !== undefined && imageData.cost !== null) {
      setTotalCost(prev => prev + imageData.cost!)
    }

    try {
      await saveImage(newImage)
    } catch (error) {
      console.error('Ошибка сохранения изображения в IndexedDB:', error)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const remainingSlots = 4 - sourceImages.length
    const filesToAdd = files.slice(0, remainingSlots)

    filesToAdd.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
          setSourceImages(prev => [...prev, {
            id: Math.random().toString(36).substr(2, 9),
            file,
            preview: e.target?.result as string
          }])
        }
        reader.readAsDataURL(file)
      }
    })

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeSourceImage = (id: string) => {
    setSourceImages(prev => prev.filter(img => img.id !== id))
  }

  const addToNextGeneration = (imageUrl: string) => {
    if (sourceImages.length >= 4) return

    fetch(imageUrl)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], 'generated.jpg', { type: 'image/jpeg' })
        setSourceImages(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          file,
          preview: imageUrl
        }])
      })
  }

  const downloadImage = (url: string, filename: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const getImageResolution = (url: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(`${img.naturalWidth}×${img.naturalHeight}`)
      img.onerror = () => resolve('')
      img.src = url
    })
  }

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  const handleSaveApiKey = () => {
    if (tempApiKey.trim()) {
      setApiKey(tempApiKey.trim())
      localStorage.setItem('openrouter_api_key', tempApiKey.trim())
      setShowSettingsModal(false)
    } else {
      alert('Пожалуйста, введите API ключ OpenRouter')
    }
  }

  const handleClearKey = () => {
    setTempApiKey('')
    setApiKey('')
    localStorage.removeItem('openrouter_api_key')
  }

  // Обработка Enter для отправки (Shift+Enter — перенос строки)
  const handleKeyDown = (_e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter не запускает генерацию — только кнопка
  }

  const generateImage = async () => {
    if (!prompt.trim()) return

    if (!apiKey.trim()) {
      setShowSettingsModal(true)
      return
    }

    setIsGenerating(true)

    try {
      const messages: OpenRouterMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT }
      ]
      const resolvedAspectRatio = currentModelCapabilities.aspectRatios.includes(aspectRatio)
        ? aspectRatio
        : currentModelCapabilities.aspectRatios[0] ?? '1:1'
      const resolvedImageSize = currentModelCapabilities.imageSizes.includes(imageSize)
        ? imageSize
        : currentModelCapabilities.imageSizes[0] ?? '1K'
      const resolvedThinkingLevel = currentModelCapabilities.supportsThinkingLevel
        ? thinkingLevel
        : 'minimal'

      if (sourceImages.length > 0) {
        const imageContents: MessageContentPart[] = await Promise.all(
          sourceImages.map(async (img) => {
            const dataUrl = await fileToDataUrl(img.file)
            return {
              type: 'image_url' as const,
              image_url: { url: dataUrl }
            }
          })
        )

        messages.push({
          role: 'user',
          content: [
            ...imageContents,
            { type: 'text' as const, text: prompt }
          ]
        })
      } else {
        messages.push({
          role: 'user',
          content: prompt
        })
      }

      const requestImageGeneration = async (requestedImageSize: string) => {
        const body: Record<string, unknown> = {
          model: selectedModel,
          messages,
          modalities: ['image', 'text'],
          image_config: {
            aspect_ratio: resolvedAspectRatio,
            image_size: requestedImageSize,
          },
        }

        // Thinking level только для Flash 3.1 (для Pro — mandatory, управлять нельзя)
        if (currentModelCapabilities.supportsThinkingLevel) {
          body.reasoning = { effort: resolvedThinkingLevel }
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(body)
        })

        return await response.json()
      }

      let effectiveImageSize = resolvedImageSize
      let data = await requestImageGeneration(effectiveImageSize)
      let wasFallbackTo2K = false

      if (data.error && effectiveImageSize === '4K' && currentModelCapabilities.imageSizes.includes('2K')) {
        const errorText = `${data.error?.message ?? ''} ${data.error?.metadata?.raw ?? ''}`.toLowerCase()
        const isSizeRelatedError =
          errorText.includes('image_size') ||
          errorText.includes('4k') ||
          errorText.includes('resolution') ||
          errorText.includes('aspect_ratio') ||
          errorText.includes('invalid')

        if (isSizeRelatedError) {
          const fallbackData = await requestImageGeneration('2K')
          if (!fallbackData.error) {
            data = fallbackData
            effectiveImageSize = '2K'
            wasFallbackTo2K = true
            setImageSize('2K')
          }
        }
      }

      if (wasFallbackTo2K) {
        alert('4K недоступен для выбранной модели/формата. Использовано 2K.')
      }

      console.log('=== API Response ===')
      console.log('Full response:', JSON.stringify(data, null, 2))

      let cost = null
      let generationId = null
      let tokens = null

      if (data.usage?.cost !== undefined) {
        cost = data.usage.cost
      } else if (data.usage?.total_cost !== undefined) {
        cost = data.usage.total_cost
      } else if (data.cost !== undefined) {
        cost = data.cost
      }

      if (data.id) {
        generationId = data.id
      } else if (data.choices?.[0]?.generation_id) {
        generationId = data.choices[0].generation_id
      }

      if (data.usage) {
        tokens = {
          prompt: data.usage.prompt_tokens || 0,
          completion: data.usage.completion_tokens || 0,
          total: data.usage.total_tokens || 0
        }
      }

      // Хелпер: добавить изображение с определением реального разрешения
      const addWithResolution = async (url: string) => {
        const resolution = await getImageResolution(url)
        await addGeneratedImage({ url, prompt, cost, generationId, model: selectedModel, tokens, aspectRatio: resolvedAspectRatio, imageSize: effectiveImageSize, temperature: null, thinkingLevel: resolvedThinkingLevel, resolution: resolution || null })
      }

      // Извлекаем URL картинки из разных форматов ответа
      let extractedImageUrl: string | null = null
      const msg = data.choices?.[0]?.message

      if (msg?.images?.[0]?.image_url?.url) {
        extractedImageUrl = msg.images[0].image_url.url
      } else if (typeof msg?.images?.[0] === 'string') {
        extractedImageUrl = msg.images[0]
      } else if (msg?.content) {
        const content = msg.content
        if (typeof content === 'string' && content.startsWith('data:image')) {
          extractedImageUrl = content
        } else if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'image_url' && item.image_url?.url) {
              extractedImageUrl = item.image_url.url
              break
            } else if (typeof item === 'string' && item.startsWith('data:image')) {
              extractedImageUrl = item
              break
            }
          }
        }
      }

      if (extractedImageUrl) {
        await addWithResolution(extractedImageUrl)
      } else if (data.error) {
        console.error('API Error:', data.error)
        const errorMsg = data.error.message || 'Неизвестная ошибка'
        const errorDetails = data.error.metadata?.raw || ''

        if (data.error.code === 429 || errorMsg.includes('rate-limited')) {
          alert(`Rate Limit\n\n${errorMsg}\n\nПопробуйте переключить модель или подождать 1-2 минуты.\n\n${errorDetails}`)
        } else {
          alert(`Ошибка API\n\n${errorMsg}\n\n${errorDetails}`)
        }
      } else {
        // Проверяем native_finish_reason (модерация, безопасность)
        const finishReason = data.choices?.[0]?.native_finish_reason
        const reasonMessages: Record<string, string> = {
          'IMAGE_PROHIBITED_CONTENT': 'Контент запрещён модерацией. Измените промт и попробуйте снова.',
          'SAFETY': 'Запрос отклонён фильтром безопасности.',
          'RECITATION': 'Запрос отклонён из-за авторских прав.',
        }

        if (finishReason && reasonMessages[finishReason]) {
          alert(reasonMessages[finishReason])
        } else {
          // Если модель вернула текст вместо картинки — показываем его
          const textContent = msg?.content
          const textMsg = typeof textContent === 'string' ? textContent : ''
          console.error('Изображение не получено. Ответ:', data)
          alert(`Модель не вернула изображение.${finishReason ? `\nПричина: ${finishReason}` : ''}${textMsg ? `\n\nОтвет модели: ${textMsg.slice(0, 300)}` : '\n\nПопробуйте изменить промт или переключить модель.'}`)
        }
      }
    } catch (error) {
      console.error('Generation error:', error)
      const isNetworkError = error instanceof TypeError && error.message === 'Failed to fetch'
      if (isNetworkError) {
        alert('Ошибка сети: соединение сброшено.\n\nПопробуйте уменьшить разрешение (2K/1K) или формат — большие изображения могут превышать лимиты API.')
      } else {
        alert('Ошибка при генерации изображения')
      }
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background gradient-mesh flex flex-col">
      {/* Текстурный оверлей */}
      <div className="grain-overlay" />

      {/* Шапка */}
      <header className="sticky top-0 z-30 glass border-b" style={{ borderColor: 'var(--header-border)' }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-12 h-[56px] flex items-center justify-between">
          <h1 className="text-[22px] font-bold bg-clip-text text-transparent tracking-tight" style={{ backgroundImage: `linear-gradient(to right, var(--logo-from), var(--logo-via), var(--logo-to))` }}>
            ВИДЕНИЕ
          </h1>
          <div className="flex items-center gap-3">
            {totalCost > 0 && (
              <span className="text-xs font-semibold text-primary px-3.5 py-1.5 rounded-full flex items-center gap-1.5" style={{ background: 'var(--badge-cost-bg)', border: '1px solid var(--badge-cost-border)' }}>
                <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                ${totalCost.toFixed(3)}
              </span>
            )}
            {totalImagesCount > 0 && (
              <span className="text-xs text-foreground/60 px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ background: 'var(--chip-bg)', border: '1px solid var(--chip-border)' }}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                {totalImagesCount} изобр.
              </span>
            )}
            {/* Переключатель темы */}
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors" style={{ background: 'var(--chip-bg)', border: '1px solid var(--chip-border)' }}
              title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-foreground/60" /> : <Moon className="w-4 h-4 text-foreground/60" />}
            </button>
            <button
              onClick={() => setShowSettingsModal(true)}
              className={`text-[13px] px-4 py-1.5 rounded-xl transition-colors flex items-center gap-2 ${apiKey ? 'text-green-400 hover:text-green-300' : 'text-foreground/60 hover:text-foreground/80'}`}
              style={{
                background: apiKey ? 'rgba(34,197,94,0.1)' : 'var(--chip-bg)',
                border: apiKey ? '1px solid rgba(34,197,94,0.3)' : '1px solid var(--chip-border)'
              }}
              title={apiKey ? 'API ключ установлен' : 'Установить API ключ'}
            >
              <KeyRound className="w-4 h-4" />
              <span className="hidden sm:inline">Настройки</span>
            </button>
          </div>
        </div>
      </header>

      {/* Основная область с галереей */}
      <main className="flex-1 pb-52">
        <div className="max-w-6xl mx-auto px-5 sm:px-12 py-8">
          {generatedImages.length > 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* Заголовок секции — как в макете */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-[26px] font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, var(--title-from), var(--title-to))` }}>
                  Галерея
                </h2>
                {totalImagesCount > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-[13px] text-destructive hover:brightness-110 px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5" style={{ background: 'var(--clear-bg)', border: '1px solid var(--clear-border)' }}
                  >
                    <Trash2 className="w-[15px] h-[15px]" />
                    <span>Очистить</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <AnimatePresence>
                  {generatedImages.map((img) => (
                    <motion.div
                      key={img.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="group relative rounded-[18px] overflow-hidden bg-card transition-all duration-200" style={{ border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)' }}
                    >
                      {/* Изображение */}
                      <div
                        className="relative aspect-square bg-black/20 cursor-pointer overflow-hidden"
                        onClick={() => setSelectedImage(img)}
                      >
                        <img
                          src={img.url}
                          alt={img.prompt}
                          className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                        {/* Оверлей действий при наведении */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <div className="absolute bottom-2 right-2 flex gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                downloadImage(img.url, `lumigen-${img.id}.jpg`)
                              }}
                              className="p-2 bg-white/70 hover:bg-white/90 backdrop-blur-sm rounded-full transition-colors text-black/70 hover:text-black"
                              title="Скачать"
                            >
                              <ArrowDownToLine className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                addToNextGeneration(img.url)
                              }}
                              disabled={sourceImages.length >= 4}
                              className="p-2 bg-white/70 hover:bg-white/90 backdrop-blur-sm rounded-full transition-colors disabled:opacity-50 text-black/70 hover:text-black"
                              title="Использовать в генерации"
                            >
                              <ImagePlus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteImage(img)
                              }}
                              className="p-2 bg-white/70 hover:bg-destructive/90 backdrop-blur-sm rounded-full transition-colors text-black/70 hover:text-white"
                              title="Удалить"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Информация под изображением */}
                      <div className="p-3.5 space-y-2">
                        <p className="text-[13px] text-foreground/80 line-clamp-2 leading-[1.3]">
                          {img.prompt}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {img.aspectRatio && (
                            <span className="text-[10px] text-muted-foreground/60 bg-white/[0.06] px-2 py-0.5 rounded-full">
                              {img.aspectRatio}
                            </span>
                          )}
                          {img.imageSize && (
                            <span className="text-[10px] text-muted-foreground/60 bg-white/[0.06] px-2 py-0.5 rounded-full">
                              {img.imageSize}
                            </span>
                          )}
                          {img.resolution && (
                            <span className="text-[10px] text-muted-foreground/60 bg-white/[0.06] px-2 py-0.5 rounded-full">
                              {img.resolution}
                            </span>
                          )}
                          {img.thinkingLevel && (
                            <span className="text-[10px] text-muted-foreground/60 bg-white/[0.06] px-2 py-0.5 rounded-full">
                              {img.thinkingLevel === 'minimal' ? 'Fast' : 'Think'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          {img.model && (
                            <span className="text-[11px] text-muted-foreground/50 truncate">
                              {MODELS.find(m => m.id === img.model)?.name?.split(' (')[0] || img.model}
                            </span>
                          )}
                          {img.cost !== undefined && img.cost !== null && (
                            <span className="text-[11px] font-medium text-primary">
                              ${img.cost.toFixed(3)}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Индикатор загрузки для бесконечной ленты */}
              {isLoadingImages && (
                <div className="flex justify-center items-center py-8">
                  <LoaderCircle className="w-6 h-6 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Загрузка...</span>
                </div>
              )}

              {!hasMoreImages && generatedImages.length > 0 && (
                <div className="text-center py-6 text-muted-foreground/50 text-xs">
                  Все изображения загружены ({totalImagesCount})
                </div>
              )}
            </motion.div>
          ) : (
            /* Пустое состояние — в стиле LLM-чатов */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center min-h-[calc(100vh-16rem)]"
            >
              <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(212,168,37,0.15)]">
                <WandSparkles className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2 bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, var(--title-from), var(--title-to))` }}>Чем могу помочь?</h2>
              <p className="text-muted-foreground mb-8 text-center max-w-md">
                Опишите изображение, которое хотите создать, или выберите пример ниже
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                {PROMPT_EXAMPLES.map((example, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPrompt(example.text)}
                    className="text-left p-4 rounded-2xl transition-all text-sm text-muted-foreground leading-relaxed dropdown-opt" style={{ border: '1px solid var(--card-border)' }}
                  >
                    <span className="mr-2">{example.icon}</span>
                    <span className="line-clamp-2">{example.text}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* Фиксированная нижняя панель — как в макете */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div className="py-4 space-y-3" style={{ background: 'var(--panel-bg)', borderTop: '1px solid var(--panel-border)' }}>
          <div className="max-w-6xl mx-auto px-5 sm:px-12 space-y-3 relative">
            {/* Превью исходных изображений */}
            <AnimatePresence>
              {sourceImages.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex gap-2 overflow-hidden"
                >
                  {sourceImages.map((img) => (
                    <div key={img.id} className="relative w-16 h-16 flex-shrink-0">
                      <div className="w-full h-full rounded-2xl overflow-hidden border border-white/10">
                        <img
                          src={img.preview}
                          alt="Исходное"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeSourceImage(img.id) }}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center z-20"
                        style={{ background: '#D44A4A' }}
                      >
                        <span className="text-white text-[10px] font-bold leading-none">✕</span>
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ряд чипов параметров — как в макете */}
            <div ref={dropdownAreaRef} className="flex items-center gap-2 flex-wrap">
              {/* Чип модели */}
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'model' ? null : 'model')}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${openDropdown === 'model' ? 'text-primary' : 'text-foreground/80'}`}
                  style={{ background: openDropdown === 'model' ? 'var(--chip-active-bg)' : 'var(--chip-bg)', border: `1px solid ${openDropdown === 'model' ? 'var(--chip-active-border)' : 'var(--chip-border)'}` }}
                >
                  <span>{MODELS.find(m => m.id === selectedModel)?.name.split(' (')[0]}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                <AnimatePresence>
                  {openDropdown === 'model' && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="absolute bottom-full left-0 mb-2 z-50 w-[260px] rounded-[18px] border border-[rgba(255,204,51,0.13)] p-[14px_18px] space-y-2.5 shadow-[0_-6px_32px_rgba(0,0,0,0.38)]"
                      style={{ background: 'var(--dropdown-bg)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-semibold text-foreground">Модель</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{MODELS.length} доступно</span>
                      </div>
                      <div className="space-y-1">
                        {MODELS.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => { setSelectedModel(model.id); setOpenDropdown(null) }}
                            className={`w-full flex items-center justify-between rounded-[10px] px-3.5 py-2.5 text-xs font-medium transition-colors ${selectedModel === model.id ? 'dropdown-opt-active text-primary' : 'dropdown-opt text-foreground'}`}
                          >
                            <span>{model.name.split(' (')[0]}</span>
                            {selectedModel === model.id && <Check className="w-3 h-3 text-primary" />}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Чип формата */}
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'ratio' ? null : 'ratio')}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${openDropdown === 'ratio' ? 'text-primary' : 'text-foreground/80'}`}
                  style={{ background: openDropdown === 'ratio' ? 'var(--chip-active-bg)' : 'var(--chip-bg)', border: `1px solid ${openDropdown === 'ratio' ? 'var(--chip-active-border)' : 'var(--chip-border)'}` }}
                >
                  <span>{aspectRatio}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                <AnimatePresence>
                  {openDropdown === 'ratio' && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="absolute bottom-full left-0 mb-2 z-50 w-[220px] rounded-[18px] border border-[rgba(255,204,51,0.13)] p-[14px_18px] space-y-2.5 shadow-[0_-6px_32px_rgba(0,0,0,0.38)]"
                      style={{ background: 'var(--dropdown-bg)' }}
                    >
                      <div className="flex items-center gap-2">
                        <Ratio className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-semibold text-foreground">Формат</span>
                      </div>
                      <div className="space-y-1">
                        {ASPECT_RATIOS.map((ratio) => (
                          <button
                            key={ratio.id}
                            onClick={() => { setAspectRatio(ratio.id); setOpenDropdown(null) }}
                            disabled={!currentModelCapabilities.aspectRatios.includes(ratio.id)}
                            className={`w-full flex items-center justify-between rounded-[10px] px-3.5 py-2.5 text-xs font-medium transition-colors disabled:opacity-40 ${aspectRatio === ratio.id ? 'dropdown-opt-active text-primary' : 'dropdown-opt text-foreground'}`}
                          >
                            <span>{ratio.id} — {ratio.name.split(' (')[0]}</span>
                            {aspectRatio === ratio.id && <Check className="w-3 h-3 text-primary" />}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Чип разрешения */}
              <div className="relative">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'size' ? null : 'size')}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${openDropdown === 'size' ? 'text-primary' : 'text-foreground/80'}`}
                  style={{ background: openDropdown === 'size' ? 'var(--chip-active-bg)' : 'var(--chip-bg)', border: `1px solid ${openDropdown === 'size' ? 'var(--chip-active-border)' : 'var(--chip-border)'}` }}
                >
                  <span>{imageSize}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                <AnimatePresence>
                  {openDropdown === 'size' && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="absolute bottom-full left-0 mb-2 z-50 w-[220px] rounded-[18px] border border-[rgba(255,204,51,0.13)] p-[14px_18px] space-y-2.5 shadow-[0_-6px_32px_rgba(0,0,0,0.38)]"
                      style={{ background: 'var(--dropdown-bg)' }}
                    >
                      <div className="flex items-center gap-2">
                        <Maximize className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-semibold text-foreground">Разрешение</span>
                      </div>
                      <div className="space-y-1">
                        {IMAGE_SIZES.map((size) => {
                          const resMap: Record<string, string> = { '0.5K': '512×512', '1K': '1024×1024', '2K': '2048×2048', '4K': '4096×4096' }
                          return (
                            <button
                              key={size.id}
                              onClick={() => { setImageSize(size.id); setOpenDropdown(null) }}
                              disabled={!currentModelCapabilities.imageSizes.includes(size.id)}
                              className={`w-full flex items-center justify-between rounded-[10px] px-3.5 py-2.5 text-xs font-medium transition-colors disabled:opacity-40 ${imageSize === size.id ? 'dropdown-opt-active text-primary' : 'dropdown-opt text-foreground'}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{size.id}</span>
                                <span className="text-muted-foreground font-mono text-[10px]">{resMap[size.id]}</span>
                              </div>
                              {imageSize === size.id && <Check className="w-3 h-3 text-primary" />}
                            </button>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Уровень размышления */}
              {currentModelCapabilities.supportsThinkingLevel && (
                <button
                  onClick={() => setThinkingLevel(thinkingLevel === 'minimal' ? 'high' : 'minimal')}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${thinkingLevel === 'high' ? 'text-primary' : 'text-foreground/80'}`}
                  style={{ background: thinkingLevel === 'high' ? 'var(--chip-active-bg)' : 'var(--chip-bg)', border: `1px solid ${thinkingLevel === 'high' ? 'var(--chip-active-border)' : 'var(--chip-border)'}` }}
                >
                  {thinkingLevel === 'minimal' ? 'Fast' : 'Think'}
                </button>
              )}
            </div>


            {/* Ряд ввода — как в макете */}
            <div className="flex items-end gap-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                multiple
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={sourceImages.length >= 4}
                className="w-11 h-11 rounded-[16px] attach-btn hover:brightness-110 flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-30"
                title="Прикрепить изображение"
              >
                <Paperclip className="w-5 h-5 text-muted-foreground" />
              </button>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Опишите изображение, которое хотите создать..."
                className="flex-1 bottom-input rounded-[18px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none resize-none text-[15px] max-h-32 py-3.5 px-5 leading-relaxed"
                rows={1}
              />
              <button
                onClick={generateImage}
                disabled={isGenerating || !prompt.trim()}
                className="h-11 rounded-[16px] bg-gradient-to-r from-[#FFCC33] via-[#D4A825] to-[#C47A0A] hover:brightness-110 flex items-center justify-center gap-2 transition-all flex-shrink-0 shadow-[0_2px_12px_rgba(212,168,37,0.25)] px-6"
                title="Сгенерировать"
              >
                {isGenerating ? (
                  <LoaderCircle className="w-5 h-5 animate-spin text-[#110E06]" />
                ) : (
                  <>
                    <SendHorizontal className="w-5 h-5 text-[#110E06]" />
                    <span className="text-[15px] font-bold text-[#110E06] hidden sm:inline">Сгенерировать</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно API ключа */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            style={{ background: theme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)' }}
            onClick={() => setShowSettingsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-3xl p-6 max-w-md w-full" style={{ background: 'var(--dropdown-bg)', border: '1px solid var(--card-border)' }}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                  <KeyRound className="w-5 h-5" />
                  API ключ OpenRouter
                </h2>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="p-1.5 rounded-full transition-colors" style={{ background: 'var(--chip-bg)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <input
                    type="text"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="w-full bottom-input rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm text-foreground"
                  />
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Ключ хранится локально в вашем браузере. Получить ключ:{' '}
                    <a
                      href="https://openrouter.ai/settings/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      openrouter.ai
                    </a>
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSaveApiKey}
                    className="flex-1 hover:brightness-110 font-semibold py-2.5 px-6 rounded-full transition-all text-sm"
                    style={{ background: `linear-gradient(to right, var(--btn-from), var(--btn-via), var(--btn-to))`, color: 'var(--btn-text)', boxShadow: `0 2px 12px var(--btn-shadow)` }}
                  >
                    Сохранить
                  </button>
                  <button
                    onClick={handleClearKey}
                    className="px-4 py-2.5 rounded-full transition-colors text-sm text-foreground/80" style={{ background: 'var(--chip-bg)', border: '1px solid var(--chip-border)' }}
                  >
                    Очистить
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Модальное окно просмотра изображения */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
            style={{ background: theme === 'dark' ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.5)' }}
            onClick={() => setSelectedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[95vw] md:w-auto md:max-w-5xl max-h-[85vh] md:max-h-[90vh] relative"
            >
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute -top-12 right-0 p-2 rounded-full transition-colors"
                style={{ background: 'var(--chip-bg)', border: '1px solid var(--chip-border)' }}
                title="Закрыть"
              >
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
              <img
                src={selectedImage.url}
                alt={selectedImage.prompt}
                className="max-w-full max-h-[60vh] md:max-h-[75vh] object-contain rounded-3xl mx-auto"
              />
              <div className="mt-3 rounded-3xl p-5" style={{ background: 'var(--dropdown-bg)', border: '1px solid var(--card-border)' }}>
                <p className="text-sm text-foreground/90 mb-3 line-clamp-3 leading-relaxed">
                  {selectedImage.prompt}
                </p>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {selectedImage.model && (
                      <span className="text-muted-foreground">
                        {MODELS.find(m => m.id === selectedImage.model)?.name || selectedImage.model}
                      </span>
                    )}
                    {selectedImage.aspectRatio && (
                      <span className="px-2 py-0.5 rounded-full text-muted-foreground" style={{ background: 'var(--chip-bg)' }}>{selectedImage.aspectRatio}</span>
                    )}
                    {selectedImage.imageSize && (
                      <span className="px-2 py-0.5 rounded-full text-muted-foreground" style={{ background: 'var(--chip-bg)' }}>{selectedImage.imageSize}</span>
                    )}
                    {selectedImage.resolution && (
                      <span className="px-2 py-0.5 rounded-full text-muted-foreground" style={{ background: 'var(--chip-bg)' }}>{selectedImage.resolution}</span>
                    )}
                    {selectedImage.cost !== undefined && selectedImage.cost !== null && (
                      <span className="text-muted-foreground">${selectedImage.cost.toFixed(4)}</span>
                    )}
                    {selectedImage.tokens && (
                      <span className="text-muted-foreground">Tokens: {selectedImage.tokens.total}</span>
                    )}
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    <button
                      onClick={() => {
                        handleDeleteImage(selectedImage)
                        setSelectedImage(null)
                      }}
                      className="flex items-center justify-center gap-2 text-destructive px-5 py-2 rounded-full transition-colors text-sm flex-1 md:flex-none" style={{ background: 'var(--clear-bg)', border: '1px solid var(--clear-border)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Удалить</span>
                    </button>
                    <button
                      onClick={() => {
                        downloadImage(selectedImage.url, `lumigen-${selectedImage.id}.jpg`)
                        setSelectedImage(null)
                      }}
                      className="flex items-center justify-center gap-2 hover:brightness-110 font-semibold px-5 py-2 rounded-full transition-all text-sm flex-1 md:flex-none"
                      style={{ background: `linear-gradient(to right, var(--btn-from), var(--btn-via), var(--btn-to))`, color: 'var(--btn-text)', boxShadow: `0 2px 12px var(--btn-shadow)` }}
                    >
                      <ArrowDownToLine className="w-4 h-4" />
                      <span>Скачать</span>
                    </button>
                    <button
                      onClick={() => {
                        addToNextGeneration(selectedImage.url)
                        setSelectedImage(null)
                      }}
                      disabled={sourceImages.length >= 4}
                      className="flex items-center justify-center gap-2 px-5 py-2 rounded-full transition-colors text-sm disabled:opacity-50 flex-1 md:flex-none text-foreground/80" style={{ background: 'var(--chip-bg)', border: '1px solid var(--chip-border)' }}
                    >
                      <ImagePlus className="w-4 h-4" />
                      <span>Добавить</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App

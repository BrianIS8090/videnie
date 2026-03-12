import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowDownToLine, ImagePlus, X, LoaderCircle, KeyRound, SendHorizontal, Paperclip, Trash2, ChevronDown, WandSparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { saveImage, getAllImages, clearAllImages, getImagesCount, getTotalCost, deleteImage } from './utils/imageDB'
import './index.css'

const MODELS = [
  { id: 'google/gemini-3-pro-image-preview', name: 'Nano Banana Pro (Рекомендуется)' },
  { id: 'google/gemini-3.1-flash-image-preview', name: 'Nano Banana 2' },
  { id: 'google/gemini-2.5-flash-image', name: 'Nano Banana Legacy' },
]

const ASPECT_RATIOS = [
  { id: '1:1', name: 'Квадрат (1:1)' },
  { id: '16:9', name: 'Широкий (16:9)' },
  { id: '9:16', name: 'Вертикальный (9:16)' },
  { id: '4:3', name: 'Классический (4:3)' },
  { id: '3:4', name: 'Портрет (3:4)' },
  { id: '21:9', name: 'Кинематограф (21:9)' },
]

const IMAGE_SIZES = [
  { id: '1K', name: '1K — Стандарт' },
  { id: '2K', name: '2K — Высокое' },
  { id: '4K', name: '4K — Максимум' },
]

const THINKING_LEVELS = [
  { id: 'minimal', name: 'Minimal — Быстро' },
  { id: 'high', name: 'High — Качество' },
]

interface ModelCapabilities {
  imageSizes: string[]
  aspectRatios: string[]
  supportsThinkingLevel: boolean
}

const DEFAULT_MODEL_CAPABILITIES: ModelCapabilities = {
  imageSizes: ['1K', '2K', '4K'],
  aspectRatios: ASPECT_RATIOS.map((ratio) => ratio.id),
  supportsThinkingLevel: false,
}

const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'google/gemini-3-pro-image-preview': {
    imageSizes: ['1K', '2K', '4K'],
    aspectRatios: ASPECT_RATIOS.map((ratio) => ratio.id),
    supportsThinkingLevel: true,
  },
  'google/gemini-3.1-flash-image-preview': {
    imageSizes: ['1K', '2K', '4K'],
    aspectRatios: ASPECT_RATIOS.map((ratio) => ratio.id),
    supportsThinkingLevel: true,
  },
  'google/gemini-2.5-flash-image': {
    imageSizes: ['1K', '2K', '4K'],
    aspectRatios: ASPECT_RATIOS.map((ratio) => ratio.id),
    supportsThinkingLevel: false,
  },
}

type MessageContentPart =
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'text'; text: string }

interface OpenRouterMessage {
  role: 'user'
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
  const [temperature, setTemperature] = useState(1.0)
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previousImageUrlsRef = useRef<Map<string, string>>(new Map())
  const [prompt, setPrompt] = useState('')
  const currentModelCapabilities = MODEL_CAPABILITIES[selectedModel] ?? DEFAULT_MODEL_CAPABILITIES

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
      thinkingLevel: imageData.thinkingLevel
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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (prompt.trim() && !isGenerating) {
        generateImage()
      }
    }
  }

  const generateImage = async () => {
    if (!prompt.trim()) return

    if (!apiKey.trim()) {
      setShowSettingsModal(true)
      return
    }

    setIsGenerating(true)

    try {
      const messages: OpenRouterMessage[] = []
      const resolvedAspectRatio = currentModelCapabilities.aspectRatios.includes(aspectRatio)
        ? aspectRatio
        : currentModelCapabilities.aspectRatios[0] ?? '1:1'
      const resolvedImageSize = currentModelCapabilities.imageSizes.includes(imageSize)
        ? imageSize
        : currentModelCapabilities.imageSizes[0] ?? '1K'
      const resolvedThinkingLevel = currentModelCapabilities.supportsThinkingLevel
        ? thinkingLevel
        : 'minimal'
      const imageConfig: {
        aspect_ratio: string
        image_size: string
        temperature: number
        thinking_level?: string
      } = {
        aspect_ratio: resolvedAspectRatio,
        image_size: resolvedImageSize,
        temperature,
      }

      if (currentModelCapabilities.supportsThinkingLevel) {
        imageConfig.thinking_level = resolvedThinkingLevel
      }

      const enhancedPrompt = `Generate an image: ${prompt}`

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
            { type: 'text' as const, text: enhancedPrompt }
          ]
        })
      } else {
        messages.push({
          role: 'user',
          content: enhancedPrompt
        })
      }

      const requestImageGeneration = async (requestedImageSize: string) => {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: selectedModel,
            messages,
            modalities: ['image', 'text'],
            image_config: {
              ...imageConfig,
              image_size: requestedImageSize,
            },
          })
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

      if (data.choices?.[0]?.message?.images?.[0]?.image_url?.url) {
        const imageUrl = data.choices[0].message.images[0].image_url.url
        await addGeneratedImage({ url: imageUrl, prompt, cost, generationId, model: selectedModel, tokens, aspectRatio: resolvedAspectRatio, imageSize: effectiveImageSize, temperature, thinkingLevel: resolvedThinkingLevel })
      } else if (data.choices?.[0]?.message?.images?.[0]) {
        const imageUrl = data.choices[0].message.images[0]
        await addGeneratedImage({ url: imageUrl, prompt, cost, generationId, model: selectedModel, tokens, aspectRatio: resolvedAspectRatio, imageSize: effectiveImageSize, temperature, thinkingLevel: resolvedThinkingLevel })
      } else if (data.choices?.[0]?.message?.content) {
        const content = data.choices[0].message.content
        if (typeof content === 'string' && content.startsWith('data:image')) {
          await addGeneratedImage({ url: content, prompt, cost, generationId, model: selectedModel, tokens, aspectRatio: resolvedAspectRatio, imageSize: effectiveImageSize, temperature, thinkingLevel: resolvedThinkingLevel })
        } else if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'image_url' && item.image_url?.url) {
              const imageUrl = item.image_url.url
              await addGeneratedImage({ url: imageUrl, prompt, cost, generationId, model: selectedModel, tokens, aspectRatio: resolvedAspectRatio, imageSize: effectiveImageSize, temperature, thinkingLevel: resolvedThinkingLevel })
              break
            } else if (typeof item === 'string' && item.startsWith('data:image')) {
              await addGeneratedImage({ url: item, prompt, cost, generationId, model: selectedModel, tokens, aspectRatio: resolvedAspectRatio, imageSize: effectiveImageSize, temperature, thinkingLevel: resolvedThinkingLevel })
              break
            }
          }
        }
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
        console.error('Unexpected response format:', data)
        alert('Ошибка генерации: неожиданный формат ответа')
      }
    } catch (error) {
      console.error('Generation error:', error)
      alert('Ошибка при генерации изображения')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background gradient-mesh flex flex-col">
      {/* Текстурный оверлей */}
      <div className="grain-overlay" />

      {/* Шапка */}
      <header className="sticky top-0 z-30 glass border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent tracking-tight">
            ВИДЕНИЕ
          </h1>
          <div className="flex items-center gap-2">
            {totalCost > 0 && (
              <span className="text-xs text-muted-foreground bg-white/5 px-2.5 py-1 rounded-full">
                ${totalCost.toFixed(4)}
              </span>
            )}
            {totalImagesCount > 0 && (
              <button
                onClick={handleClearHistory}
                className="text-xs text-muted-foreground hover:text-destructive bg-white/5 hover:bg-destructive/10 px-2.5 py-1 rounded-full transition-colors flex items-center gap-1"
                title="Очистить историю"
              >
                <Trash2 className="w-3 h-3" />
                <span>{totalImagesCount}</span>
              </button>
            )}
            <button
              onClick={() => setShowSettingsModal(true)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${apiKey ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400' : 'bg-destructive/20 hover:bg-destructive/30 text-destructive'}`}
              title={apiKey ? 'API ключ установлен' : 'Установить API ключ'}
            >
              <KeyRound className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Основная область с галереей */}
      <main className="flex-1 pb-48">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {generatedImages.length > 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                <AnimatePresence>
                  {generatedImages.map((img) => (
                    <motion.div
                      key={img.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="group relative rounded-3xl overflow-hidden bg-white/[0.03] border border-white/[0.06] hover:border-white/15 transition-all duration-200"
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
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <div className="absolute bottom-2 right-2 flex gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                downloadImage(img.url, `lumigen-${img.id}.jpg`)
                              }}
                              className="p-2 bg-white/20 hover:bg-primary/80 backdrop-blur-sm rounded-full transition-colors"
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
                              className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full transition-colors disabled:opacity-50"
                              title="Использовать в генерации"
                            >
                              <ImagePlus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteImage(img)
                              }}
                              className="p-2 bg-white/20 hover:bg-destructive/80 backdrop-blur-sm rounded-full transition-colors"
                              title="Удалить"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Информация под изображением */}
                      <div className="p-3">
                        <p className="text-xs text-foreground/80 line-clamp-2 leading-relaxed">
                          {img.prompt}
                        </p>
                        {img.model && (
                          <p className="text-[10px] text-muted-foreground/50 mt-1.5 truncate">
                            {MODELS.find(m => m.id === img.model)?.name || img.model}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {img.aspectRatio && (
                            <span className="text-[10px] text-muted-foreground/60 bg-white/5 px-2 py-0.5 rounded-full">
                              {img.aspectRatio}
                            </span>
                          )}
                          {img.imageSize && (
                            <span className="text-[10px] text-muted-foreground/60 bg-white/5 px-2 py-0.5 rounded-full">
                              {img.imageSize}
                            </span>
                          )}
                          {img.temperature !== undefined && img.temperature !== null && (
                            <span className="text-[10px] text-muted-foreground/60 bg-white/5 px-2 py-0.5 rounded-full">
                              T:{img.temperature.toFixed(1)}
                            </span>
                          )}
                          {img.thinkingLevel && (
                            <span className="text-[10px] text-muted-foreground/60 bg-white/5 px-2 py-0.5 rounded-full">
                              {img.thinkingLevel === 'minimal' ? 'Fast' : 'Think'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {img.cost !== undefined && img.cost !== null && (
                            <span className="text-[10px] text-muted-foreground/50">
                              ${img.cost.toFixed(4)}
                            </span>
                          )}
                          {img.tokens && (
                            <span className="text-[10px] text-muted-foreground/50">
                              {img.tokens.total} tokens
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
              <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                <WandSparkles className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">Чем могу помочь?</h2>
              <p className="text-muted-foreground mb-8 text-center max-w-md">
                Опишите изображение, которое хотите создать, или выберите пример ниже
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                {PROMPT_EXAMPLES.map((example, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPrompt(example.text)}
                    className="text-left p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.06] transition-all text-sm text-muted-foreground leading-relaxed"
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

      {/* Фиксированная нижняя панель ввода */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div className="bg-gradient-to-t from-background via-background/95 to-transparent pt-6 pb-4">
          <div className="max-w-6xl mx-auto px-4">
            {/* Превью исходных изображений */}
            <AnimatePresence>
              {sourceImages.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex gap-2 mb-3 overflow-hidden"
                >
                  {sourceImages.map((img) => (
                    <div key={img.id} className="relative w-16 h-16 rounded-2xl overflow-hidden border border-white/10 flex-shrink-0">
                      <img
                        src={img.preview}
                        alt="Исходное"
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeSourceImage(img.id)}
                        className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-destructive rounded-full flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Основное поле ввода */}
            <div className="glass-strong rounded-[2rem] border border-white/10 overflow-hidden">
              <div className="flex items-end gap-2 p-3">
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
                  className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-30"
                  title="Прикрепить изображение"
                >
                  <Paperclip className="w-5 h-5 text-muted-foreground" />
                </button>
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Опишите изображение..."
                  className="flex-1 bg-white/[0.04] rounded-2xl text-foreground placeholder:text-muted-foreground/50 focus:outline-none resize-none text-sm max-h-32 py-2.5 px-4 leading-relaxed"
                  rows={1}
                />
                <button
                  onClick={generateImage}
                  disabled={isGenerating || !prompt.trim()}
                  className="w-9 h-9 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all flex-shrink-0"
                  title="Сгенерировать"
                >
                  {isGenerating ? (
                    <LoaderCircle className="w-4 h-4 animate-spin text-primary-foreground" />
                  ) : (
                    <SendHorizontal className="w-4 h-4 text-primary-foreground" />
                  )}
                </button>
              </div>

              {/* Компактная панель параметров */}
              <div className="border-t border-white/[0.06]">
                <button
                  onClick={() => setShowParams(!showParams)}
                  className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
                >
                  <span>{MODELS.find(m => m.id === selectedModel)?.name?.split(' (')[0]} / {aspectRatio} / {imageSize}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showParams ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showParams && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-2.5">
                        {/* Модель */}
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-muted-foreground/60 w-20 flex-shrink-0">Модель</label>
                          <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="flex-1 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                          >
                            {MODELS.map((model) => (
                              <option key={model.id} value={model.id} className="bg-[hsl(40,30%,10%)]">
                                {model.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Формат и Разрешение в одну строку */}
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-muted-foreground/60 w-20 flex-shrink-0">Формат</label>
                          <select
                            value={aspectRatio}
                            onChange={(e) => setAspectRatio(e.target.value)}
                            className="flex-1 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                          >
                            {ASPECT_RATIOS.map((ratio) => (
                              <option
                                key={ratio.id}
                                value={ratio.id}
                                className="bg-[hsl(40,30%,10%)]"
                                disabled={!currentModelCapabilities.aspectRatios.includes(ratio.id)}
                              >
                                {ratio.name}
                              </option>
                            ))}
                          </select>
                          <select
                            value={imageSize}
                            onChange={(e) => setImageSize(e.target.value)}
                            className="w-40 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                          >
                            {IMAGE_SIZES.map((size) => (
                              <option
                                key={size.id}
                                value={size.id}
                                className="bg-[hsl(40,30%,10%)]"
                                disabled={!currentModelCapabilities.imageSizes.includes(size.id)}
                              >
                                {size.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Температура */}
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-muted-foreground/60 w-20 flex-shrink-0">
                            T: {temperature.toFixed(1)}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            value={temperature}
                            onChange={(e) => setTemperature(parseFloat(e.target.value))}
                            className="flex-1 accent-primary h-1"
                          />
                          <div className="flex text-[10px] text-muted-foreground/40 gap-2 w-28 justify-between">
                            <span>Строгий</span>
                            <span>Креативный</span>
                          </div>
                        </div>

                        {/* Уровень размышления */}
                        {currentModelCapabilities.supportsThinkingLevel && (
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-muted-foreground/60 w-20 flex-shrink-0">Thinking</label>
                            <div className="flex gap-1.5">
                              {THINKING_LEVELS.map((level) => (
                                <button
                                  key={level.id}
                                  onClick={() => setThinkingLevel(level.id)}
                                  className={`px-3 py-1 rounded-full text-xs transition-colors ${
                                    thinkingLevel === level.id
                                      ? 'bg-primary/20 text-primary border border-primary/30'
                                      : 'bg-white/5 text-muted-foreground/60 border border-white/10 hover:bg-white/10'
                                  }`}
                                >
                                  {level.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Подпись */}
            <p className="text-center text-[10px] text-muted-foreground/30 mt-2">
              Nano Banana (Gemini) via OpenRouter &middot; ВИДЕНИЕ v1.4.0
            </p>
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={() => setShowSettingsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong rounded-3xl p-6 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <KeyRound className="w-5 h-5" />
                  API ключ OpenRouter
                </h2>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
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
                    className="w-full bg-black/30 border border-white/15 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground/50 mt-2">
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
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 px-6 rounded-full transition-colors text-sm"
                  >
                    Сохранить
                  </button>
                  <button
                    onClick={handleClearKey}
                    className="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-sm"
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
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
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
                className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                title="Закрыть"
              >
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
              <img
                src={selectedImage.url}
                alt={selectedImage.prompt}
                className="max-w-full max-h-[60vh] md:max-h-[75vh] object-contain rounded-3xl mx-auto"
              />
              <div className="mt-3 glass-strong rounded-3xl p-5">
                <p className="text-sm text-foreground/90 mb-3 line-clamp-3 leading-relaxed">
                  {selectedImage.prompt}
                </p>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {selectedImage.model && (
                      <span className="text-muted-foreground/60">
                        {MODELS.find(m => m.id === selectedImage.model)?.name || selectedImage.model}
                      </span>
                    )}
                    {selectedImage.aspectRatio && (
                      <span className="bg-white/5 px-2 py-0.5 rounded-full text-muted-foreground/50">{selectedImage.aspectRatio}</span>
                    )}
                    {selectedImage.imageSize && (
                      <span className="bg-white/5 px-2 py-0.5 rounded-full text-muted-foreground/50">{selectedImage.imageSize}</span>
                    )}
                    {selectedImage.temperature !== undefined && selectedImage.temperature !== null && (
                      <span className="bg-white/5 px-2 py-0.5 rounded-full text-muted-foreground/50">T:{selectedImage.temperature.toFixed(1)}</span>
                    )}
                    {selectedImage.cost !== undefined && selectedImage.cost !== null && (
                      <span className="text-muted-foreground/60">${selectedImage.cost.toFixed(4)}</span>
                    )}
                    {selectedImage.tokens && (
                      <span className="text-muted-foreground/60">Tokens: {selectedImage.tokens.total}</span>
                    )}
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    <button
                      onClick={() => {
                        handleDeleteImage(selectedImage)
                        setSelectedImage(null)
                      }}
                      className="flex items-center justify-center gap-2 bg-destructive/20 hover:bg-destructive/30 text-destructive px-5 py-2 rounded-full transition-colors text-sm flex-1 md:flex-none"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Удалить</span>
                    </button>
                    <button
                      onClick={() => {
                        downloadImage(selectedImage.url, `lumigen-${selectedImage.id}.jpg`)
                        setSelectedImage(null)
                      }}
                      className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-full transition-colors text-sm flex-1 md:flex-none"
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
                      className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 px-5 py-2 rounded-full transition-colors text-sm disabled:opacity-50 flex-1 md:flex-none"
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

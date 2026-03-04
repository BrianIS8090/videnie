import { useState, useRef, useEffect, useCallback } from 'react'
import { Download, ImagePlus, X, Loader2, ImageIcon, Settings, Menu, Send, Plus, Trash2 } from 'lucide-react'
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
  // OpenRouter docs по image_config: доступны 1K/2K/4K, 0.5K не документирован
  // OpenRouter model metadata: reasoning есть у 3-pro и 3.1-flash-image-preview
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
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [tempApiKey, setTempApiKey] = useState('')
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

  // Загрузить первые изображения
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

  // Загрузить следующую порцию изображений
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

  // Обработчик скролла для бесконечной ленты
  useEffect(() => {
    const handleScroll = () => {
      // Проверяем достигли ли низа страницы
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

  // Очистить всю историю
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

  // Удалить одно изображение
  const handleDeleteImage = async (img: GeneratedImage) => {
    try {
      // Удалить из IndexedDB
      await deleteImage(img.id)

      revokeObjectUrl(img.url)
      
      // Удалить из state
      setGeneratedImages(prev => prev.filter(i => i.id !== img.id))
      setTotalImagesCount(prev => prev - 1)
      
      // Обновить общую стоимость
      if (img.cost !== undefined && img.cost !== null) {
        setTotalCost(prev => prev - img.cost!)
      }
    } catch (error) {
      console.error('Ошибка удаления изображения:', error)
      alert('Ошибка при удалении изображения')
    }
  }

  // Добавить сгенерированное изображение (в state и IndexedDB)
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

    // Добавить в state (в начало массива)
    setGeneratedImages(prev => [newImage, ...prev])
    setTotalImagesCount(prev => prev + 1)
    
    // Обновить общую стоимость
    if (imageData.cost !== undefined && imageData.cost !== null) {
      setTotalCost(prev => prev + imageData.cost!)
    }

    // Сохранить в IndexedDB
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

  const generateImage = async () => {
    if (!prompt.trim()) return
    
    if (!apiKey.trim()) {
      alert('❌ API ключ не установлен\n\nНажмите на ⚙️ в левом верхнем углу и введите свой OpenRouter API ключ.\n\nПолучить ключ: https://openrouter.ai/settings/keys')
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

      // Добавляем префикс для гарантии генерации изображения
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
          alert(`⏱️ Rate Limit\n\n${errorMsg}\n\n💡 Попробуй:\n- Переключить модель на Nano Banana Pro\n- Подождать 1-2 минуты\n\n${errorDetails}`)
        } else {
          alert(`❌ Ошибка API\n\n${errorMsg}\n\n${errorDetails}`)
        }
      } else {
        console.error('Unexpected response format:', data)
        alert(`Ошибка генерации: неожиданный формат ответа`)
      }
    } catch (error) {
      console.error('Generation error:', error)
      alert('Ошибка при генерации изображения')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background gradient-mesh">
      {/* Grain Texture Overlay */}
      <div className="grain-overlay" />
      {/* Sidebar Settings Panel - СЛЕВА */}
      <div className={`
        fixed top-0 left-0 z-50 h-screen w-[280px] md:w-80
        glass transform transition-transform duration-300 ease-out
        ${isSettingsPanelOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-3 md:p-6 h-full flex flex-col overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-3 md:mb-6">
            <span className="font-semibold text-sm md:text-base">Параметры изображения</span>
            <button
              onClick={() => setIsSettingsPanelOpen(false)}
              className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              title="Закрыть"
            >
              <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          </div>

          {/* API Key Status */}
          <div className="mb-3 md:mb-6 space-y-1.5 md:space-y-2">
            <button
              onClick={() => setShowSettingsModal(true)}
              className={`w-full py-1.5 md:py-2 px-3 md:px-4 rounded-lg cursor-pointer transition-colors text-xs md:text-sm ${apiKey ? 'bg-green-500/20 hover:bg-green-500/30' : 'bg-destructive/20 hover:bg-destructive/30'}`}
            >
              {apiKey ? 'API ключ установлен' : 'API ключ не установлен'}
            </button>

            {/* Clear History Button */}
            <button
              onClick={handleClearHistory}
              className="w-full py-1.5 md:py-2 px-3 md:px-4 rounded-lg cursor-pointer transition-colors bg-destructive/20 hover:bg-destructive/30 flex items-center justify-center gap-1.5 md:gap-2 text-xs md:text-sm"
              title="Очистить всю историю сгенерированных изображений"
            >
              <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span>Очистить историю ({totalImagesCount})</span>
            </button>
            
            {/* Total Cost Display */}
            {totalCost > 0 && (
              <div className="w-full py-1.5 md:py-2 px-3 md:px-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
                <div className="text-[10px] md:text-xs text-foreground mb-0.5 md:mb-1">Общие затраты</div>
                <div className="text-base md:text-lg font-semibold text-foreground">
                  ${totalCost.toFixed(4)}
                </div>
              </div>
            )}
          </div>

          {/* Source Images */}
          {sourceImages.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Исходные изображения ({sourceImages.length}/4)
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {sourceImages.map((img) => (
                  <div key={img.id} className="relative group">
                    <img
                      src={img.preview}
                      alt="Source"
                      className="w-full aspect-square object-cover rounded-lg border-2 border-border"
                    />
                    <button
                      onClick={() => removeSourceImage(img.id)}
                      className="absolute -top-1 -right-1 p-1 bg-destructive rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prompt Input */}
          <div className="mb-3 md:mb-6 relative">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*"
              multiple
              className="hidden"
            />
            <div className="flex gap-2 md:gap-3 items-start">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={sourceImages.length >= 4}
                className="glass-strong rounded-full p-2 md:p-3 hover:bg-white/15 transition-all glow-soft border-glow flex-shrink-0 group"
                title="Добавить изображение"
              >
                <Plus className="w-6 h-6 md:w-8 md:h-8 group-hover:rotate-90 transition-transform duration-300" />
              </button>
              <div className="relative bg-black/30 border border-white/20 rounded-lg md:rounded-xl overflow-hidden flex-1">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Опишите изображение, которое хотите создать..."
                  className="w-full bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none text-xs md:text-sm overflow-hidden py-2 md:py-3 pr-2 md:pr-3 pl-2 md:pl-3"
                  rows={1}
                />
              </div>
            </div>
          </div>

          {/* Parameters */}
          <div className="space-y-2 md:space-y-4 mb-3 md:mb-6">
            {/* Model */}
            <div>
              <label className="block text-[10px] md:text-sm font-medium text-muted-foreground mb-1 md:mb-2">Модель</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-black/30 border border-white/20 rounded-lg px-2 md:px-3 py-1.5 md:py-2 focus:outline-none focus:ring-2 focus:ring-primary text-xs md:text-sm"
              >
                {MODELS.map((model) => (
                  <option key={model.id} value={model.id} className="bg-black">
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="block text-[10px] md:text-sm font-medium text-muted-foreground mb-1 md:mb-2">Формат</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full bg-black/30 border border-white/20 rounded-lg px-2 md:px-3 py-1.5 md:py-2 focus:outline-none focus:ring-2 focus:ring-primary text-xs md:text-sm"
              >
                {ASPECT_RATIOS.map((ratio) => (
                  <option
                    key={ratio.id}
                    value={ratio.id}
                    className="bg-black"
                    disabled={!currentModelCapabilities.aspectRatios.includes(ratio.id)}
                  >
                    {ratio.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Image Size */}
            <div>
              <label className="block text-[10px] md:text-sm font-medium text-muted-foreground mb-1 md:mb-2">Разрешение</label>
              <select
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value)}
                className="w-full bg-black/30 border border-white/20 rounded-lg px-2 md:px-3 py-1.5 md:py-2 focus:outline-none focus:ring-2 focus:ring-primary text-xs md:text-sm"
              >
                {IMAGE_SIZES.map((size) => (
                  <option
                    key={size.id}
                    value={size.id}
                    className="bg-black"
                    disabled={!currentModelCapabilities.imageSizes.includes(size.id)}
                  >
                    {size.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Temperature */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Температура: {temperature.toFixed(1)}
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Строгий</span>
                <span>Креативный</span>
              </div>
            </div>

            {/* Thinking Level */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Уровень размышления</label>
              <select
                value={thinkingLevel}
                onChange={(e) => setThinkingLevel(e.target.value)}
                disabled={!currentModelCapabilities.supportsThinkingLevel}
                className="w-full bg-black/30 border border-white/20 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {THINKING_LEVELS.map((level) => (
                  <option key={level.id} value={level.id} className="bg-black">
                    {level.name}
                  </option>
                ))}
              </select>
              {!currentModelCapabilities.supportsThinkingLevel && (
                <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
                  Для этой модели уровень размышления отключен.
                </p>
              )}
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={generateImage}
            disabled={isGenerating || !prompt.trim()}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-semibold py-3 md:py-4 px-4 md:px-6 rounded-lg md:rounded-xl transition-all flex items-center justify-center gap-2 glow-strong loading-pulse text-sm md:text-base"
          >
            {isGenerating ? (
              <>
                <div className="flex gap-1.5 items-center">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '0s' }}></div>
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse-dot" style={{ animationDelay: '0.4s' }}></div>
                </div>
                <span>Генерация...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 md:w-5 md:h-5" />
                Сгенерировать
              </>
            )}
          </button>

          {/* Footer */}
          <div className="pt-4 border-t border-white/10 mt-auto">
            <div className="text-[10px] md:text-xs text-muted-foreground/50 text-center">
              ВИДЕНИЕ v1.2.0
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSettingsPanelOpen(!isSettingsPanelOpen)}
              className="p-3 glass-strong rounded-xl hover:bg-white/10 transition-all glow-soft"
              title="Настройки"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              ВИДЕНИЕ
            </h1>
          </div>
        </motion.div>

        {/* Gallery */}
        {generatedImages.length > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-[calc(100vh-200px)] stagger-fade"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <AnimatePresence>
                {generatedImages.map((img) => (
                  <motion.div
                    key={img.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="glass-strong rounded-xl p-3 group hover-parallax border-glow"
                  >
                    <div 
                      className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-black/20 cursor-pointer"
                      onClick={() => setSelectedImage(img)}
                    >
                      <img
                        src={img.url}
                        alt={img.prompt}
                        className="w-full h-full object-contain"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteImage(img)
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-destructive/90 hover:bg-destructive rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Удалить"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {img.prompt}
                    </p>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          {img.model && (
                            <p className="text-xs text-muted-foreground/60 truncate">
                              {MODELS.find(m => m.id === img.model)?.name || img.model}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground/50">
                            {img.aspectRatio && (
                              <span className="bg-white/10 px-1.5 py-0.5 rounded">{img.aspectRatio}</span>
                            )}
                            {img.imageSize && (
                              <span className="bg-white/10 px-1.5 py-0.5 rounded">{img.imageSize}</span>
                            )}
                            {img.temperature !== undefined && img.temperature !== null && (
                              <span className="bg-white/10 px-1.5 py-0.5 rounded">T:{img.temperature.toFixed(1)}</span>
                            )}
                            {img.thinkingLevel && (
                              <span className="bg-white/10 px-1.5 py-0.5 rounded">{img.thinkingLevel === 'minimal' ? '⚡' : '🧠'}</span>
                            )}
                          </div>
                          {img.cost !== undefined && img.cost !== null && (
                            <p className="text-xs text-muted-foreground/70">
                              ${img.cost.toFixed(4)}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => downloadImage(img.url, `lumigen-${img.id}.jpg`)}
                            className="p-1.5 bg-primary/90 hover:bg-primary rounded-lg transition-colors"
                            title="Скачать"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => addToNextGeneration(img.url)}
                            disabled={sourceImages.length >= 4}
                            className="p-1.5 bg-secondary/90 hover:bg-secondary rounded-lg transition-colors disabled:opacity-50"
                            title="Добавить в следующую генерацию"
                          >
                            <ImagePlus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {img.tokens && (
                        <p className="text-xs text-muted-foreground/60">
                          Tokens: {img.tokens.total}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            
            {/* Loading indicator for infinite scroll */}
            {isLoadingImages && (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground">Загрузка изображений...</span>
              </div>
            )}
            
            {/* End of list indicator */}
            {!hasMoreImages && generatedImages.length > 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Все изображения загружены ({totalImagesCount} шт.)
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]"
          >
            <div className="text-center">
              <ImageIcon className="w-24 h-24 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold mb-2">Нет изображений</h2>
              <p className="text-muted-foreground mb-6">
                Нажмите на кнопку слева и сгенерируйте первое изображение
              </p>
              <div className="flex items-center justify-center gap-2 text-muted-foreground/70">
                <Menu className="w-5 h-5" />
                <span>Откройте боковую панель</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center mt-8 text-muted-foreground text-sm"
        >
          <p>Powered by Nano Banana (Google Gemini) via OpenRouter</p>
        </motion.div>
      </div>

      {/* API Key Modal */}
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
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong rounded-2xl p-6 max-w-lg w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Settings className="w-6 h-6" />
                  API ключ OpenRouter
                </h2>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    OpenRouter API ключ
                  </label>
                  <input
                    type="text"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="w-full bg-black/30 border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Ключ хранится локально в вашем браузере.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSaveApiKey}
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 px-6 rounded-lg transition-colors"
                  >
                    Сохранить
                  </button>
                  <button
                    onClick={handleClearKey}
                    className="px-6 py-3 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
                    title="Очистить"
                  >
                    Очистить
                  </button>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-muted-foreground">
                    💡 Получить API ключ можно на{' '}
                    <a
                      href="https://openrouter.ai/settings/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      openrouter.ai/settings/keys
                    </a>
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Viewer Modal */}
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
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[95vw] md:w-auto md:max-w-5xl max-h-[85vh] md:max-h-[90vh] relative"
            >
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                title="Закрыть"
              >
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
              <img
                src={selectedImage.url}
                alt={selectedImage.prompt}
                className="max-w-full max-h-[60vh] md:max-h-[75vh] object-contain rounded-lg mx-auto"
              />
              <div className="mt-3 md:mt-4 glass-strong rounded-xl p-3 md:p-4">
                <p className="text-xs md:text-sm text-foreground mb-2 md:mb-3 line-clamp-3">
                  {selectedImage.prompt}
                </p>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4">
                  <div className="flex flex-wrap items-center gap-2 md:gap-4 text-[10px] md:text-xs">
                    {selectedImage.model && (
                      <p className="text-muted-foreground/70">
                        {MODELS.find(m => m.id === selectedImage.model)?.name || selectedImage.model}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {selectedImage.aspectRatio && (
                        <span className="bg-white/10 px-1.5 py-0.5 rounded">{selectedImage.aspectRatio}</span>
                      )}
                      {selectedImage.imageSize && (
                        <span className="bg-white/10 px-1.5 py-0.5 rounded">{selectedImage.imageSize}</span>
                      )}
                      {selectedImage.temperature !== undefined && selectedImage.temperature !== null && (
                        <span className="bg-white/10 px-1.5 py-0.5 rounded">T:{selectedImage.temperature.toFixed(1)}</span>
                      )}
                      {selectedImage.thinkingLevel && (
                        <span className="bg-white/10 px-1.5 py-0.5 rounded">{selectedImage.thinkingLevel === 'minimal' ? '⚡' : '🧠'}</span>
                      )}
                    </div>
                    {selectedImage.cost !== undefined && selectedImage.cost !== null && (
                      <p className="text-muted-foreground">
                        ${selectedImage.cost.toFixed(4)}
                      </p>
                    )}
                    {selectedImage.tokens && (
                      <p className="text-muted-foreground">
                        Tokens: {selectedImage.tokens.total}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                    <button
                      onClick={() => {
                        handleDeleteImage(selectedImage)
                        setSelectedImage(null)
                      }}
                      className="flex items-center justify-center gap-2 bg-destructive hover:bg-destructive/90 text-primary-foreground px-4 py-2.5 md:py-2 rounded-lg transition-colors text-sm md:text-base"
                    >
                      <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                      <span>Удалить</span>
                    </button>
                    <button
                      onClick={() => {
                        downloadImage(selectedImage.url, `lumigen-${selectedImage.id}.jpg`)
                        setSelectedImage(null)
                      }}
                      className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 md:py-2 rounded-lg transition-colors text-sm md:text-base"
                    >
                      <Download className="w-4 h-4 md:w-5 md:h-5" />
                      <span>Скачать</span>
                    </button>
                    <button
                      onClick={() => {
                        addToNextGeneration(selectedImage.url)
                        setSelectedImage(null)
                      }}
                      disabled={sourceImages.length >= 4}
                      className="flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/90 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <ImagePlus className="w-5 h-5" />
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

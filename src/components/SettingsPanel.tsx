import React from 'react'
import { Settings, ChevronLeft, ChevronRight, Sparkles, Lightbulb, History } from 'lucide-react'

interface SettingsPanelProps {
  isOpen: boolean
  onToggle: () => void
  isMobile: boolean
  onCloseMobile: () => void
}

const PROMPT_EXAMPLES = [
  {
    id: 'lamp',
    name: 'Светильник',
    icon: '💡',
    prompt: 'Designer lamp with black body, two glowing rings in gold color, warm light, studio lighting'
  },
  {
    id: 'portrait',
    name: 'Портрет',
    icon: '🎨',
    prompt: 'Professional portrait of a woman, soft studio lighting, warm skin tones, blurred background'
  },
  {
    id: 'nature',
    name: 'Природа',
    icon: '🌲',
    prompt: 'Mystical forest with glowing mushrooms, fog, bioluminescent plants, fantasy style, cinematic lighting'
  },
  {
    id: 'product',
    name: 'Продукт',
    icon: '📦',
    prompt: 'Product photography of modern headphones on gradient background, soft lighting, commercial photography style'
  },
  {
    id: 'abstract',
    name: 'Абстракция',
    icon: '🎭',
    prompt: 'Abstract geometric composition with vibrant colors, glass effect, depth of field, modern art style'
  }
]

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onToggle,
  isMobile,
  onCloseMobile
}) => {
  return (
    <>
      {/* Мобильная подложка */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside className={`
        fixed lg:sticky top-0 right-0 z-50 h-screen w-80
        glass transform transition-transform duration-300 ease-out flex-shrink-0
        ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-[calc(100%-48px)]'}
      `}>
        <div className="p-6 h-full flex flex-col overflow-y-auto">
          {/* Заголовок */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              <span className="font-semibold">Настройки</span>
            </div>
            <button
              onClick={() => {
                onToggle()
                onCloseMobile()
              }}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              title={isOpen ? 'Свернуть' : 'Развернуть'}
            >
              {isOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* API ключ */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              API ключ
            </h3>
            <button
              onClick={() => {
                const key = localStorage.getItem('openrouter_api_key')
                if (key) {
                  alert(`API ключ: ${key}`)
                } else {
                  alert('API ключ не установлен')
                }
              }}
              className="w-full py-2 px-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-left transition-colors"
            >
              {localStorage.getItem('openrouter_api_key') ? '✅ Ключ установлен' : '❌ Ключ не установлен'}
            </button>
            <button
              onClick={() => {
                const newKey = prompt('Введите новый API ключ OpenRouter:')
                if (newKey) {
                  localStorage.setItem('openrouter_api_key', newKey)
                  window.location.reload()
                }
              }}
              className="w-full mt-2 py-2 px-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors"
            >
              Изменить ключ
            </button>
          </div>

          {/* Примеры промтов */}
          <div className="flex-1">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              Примеры промтов
            </h3>
            <div className="space-y-2">
              {PROMPT_EXAMPLES.map((example) => (
                <button
                  key={example.id}
                  onClick={() => {
                    // Вставка промпта в поле ввода (нужно передать callback)
                    const event = new CustomEvent('setPrompt', { detail: example.prompt })
                    window.dispatchEvent(event)
                    if (isMobile) onCloseMobile()
                  }}
                  className="w-full p-3 bg-white/5 hover:bg-white/10 rounded-lg text-left transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{example.icon}</span>
                    <span className="text-sm font-medium">{example.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {example.prompt}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* История генераций */}
          <div className="pt-4 border-t border-white/10">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <History className="w-4 h-4" />
              История
            </h3>
            <button
              onClick={() => {
                const history = localStorage.getItem('generation_history')
                if (history) {
                  alert(`История:\n${history}`)
                } else {
                  alert('История пуста')
                }
              }}
              className="w-full py-2 px-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-left transition-colors"
            >
              Просмотреть историю
            </button>
          </div>

          {/* Версия */}
          <div className="pt-4 border-t border-white/10">
            <div className="text-xs text-muted-foreground/50 text-center">
              LumiGen v1.0.0
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

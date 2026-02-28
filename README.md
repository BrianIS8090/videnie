<div align="center">

# 👁️ Видение

**AI Image Generator с Glassmorphism UI**

Современный генератор изображений с использованием Google Gemini Nano Banana Pro через OpenRouter API

[![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.0-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

 • [⭐ Features](#-features) • [📦 Installation](#-installation) • [🎨 Usage](#-usage)


</div>

---

## ✨ Features

### 🎨 **Modern Glassmorphism UI**
- Элегантный дизайн с эффектами размытия и прозрачности
- Плавные анимации и переходы (Framer Motion)
- Полностью адаптивный дизайн для мобильных устройств

### 🖼️ **Advanced Image Generation**
- 3 AI модели на выбор:
  - **Nano Banana Pro** (рекомендуется) - высокое качество
  - **Nano Banana 2** - баланс скорости и качества
  - **Nano Banana Legacy** - быстрая генерация
- Поддержка различных форматов (1:1, 16:9, 9:16, 4:3, 3:4)
- Настраиваемое разрешение (512px - 2048px)
- Контроль креативности (Temperature 0-2)

### 💾 **Persistent Storage**
- IndexedDB для хранения истории генераций
- Бесконечный скролл галереи
- Подсчёт общей стоимости генераций
- Экспорт изображений

### 🛠️ **Rich Functionality**
- Загрузка до 4 исходных изображений для стилизации
- Режимы креативности: Low, Medium, High, Creative
- Модальный просмотр изображений
- Удаление отдельных изображений или всей истории
- Отображение модели, стоимости и токенов для каждого изображения

### 📱 **Mobile-First Design**
- Оптимизация для смартфонов
- Компактное боковое меню
- Плавающая кнопка генерации
- Адаптивное модальное окно

---

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- npm или yarn
- OpenRouter API ключ

### Quick Start

```bash
# Клонируйте репозиторий
git clone https://github.com/BrianIS8090/videnie.git
cd videnie

# Установите зависимости
npm install

# Запустите dev сервер
npm run dev

# Соберите для продакшена
npm run build
```

### Configuration

1. Откройте приложение в браузере
2. Нажмите кнопку меню (☰) слева сверху
3. Нажмите "API ключ не установлен"
4. Введите ваш OpenRouter API ключ
5. Готово! Можно генерировать изображения 🎨

**Получить API ключ:** [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys)

---

## 🎨 Usage

### Basic Generation

1. Введите описание изображения в текстовое поле
2. Выберите модель, формат и разрешение
3. Нажмите "Сгенерировать"
4. Изображение появится в галерее

### Image-to-Image

1. Нажмите кнопку ➕ рядом с текстовым полем
2. Загрузите до 4 изображений
3. Опишите желаемый стиль
4. Сгенерируйте результат

### Gallery Management

- **Просмотр**: Кликните на изображение для детального просмотра
- **Скачать**: Кнопка "Скачать" в модальном окне
- **Удалить**: Красная кнопка "Удалить" или крестик при наведении
- **Очистить всё**: Кнопка "Очистить историю" в меню

---

## 🏗️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 18** | UI Framework |
| **TypeScript** | Type Safety |
| **Vite** | Build Tool |
| **Tailwind CSS** | Styling |
| **Framer Motion** | Animations |
| **IndexedDB** | Local Storage |
| **OpenRouter API** | AI Image Generation |
| **Google Gemini** | AI Model |

---

## 📁 Project Structure

```
videnie/
├── src/
│   ├── App.tsx              # Main component
│   ├── index.css            # Global styles & animations
│   ├── main.tsx             # Entry point
│   ├── components/
│   │   └── SettingsPanel.tsx # Settings sidebar
│   ├── utils/
│   │   └── imageDB.ts       # IndexedDB operations
│   ├── lib/
│   │   └── utils.ts         # Utility functions
│   └── assets/              # Static assets
├── public/                  # Public assets
├── index.html              # HTML template
├── package.json            # Dependencies
├── tailwind.config.ts      # Tailwind configuration
├── tsconfig.json           # TypeScript configuration
└── vite.config.ts          # Vite configuration
```

---

## 🎯 API Endpoints

Использует OpenRouter API:
- **Base URL:** `https://openrouter.ai/api/v1/chat/completions`
- **Authentication:** Bearer token
- **Models:** `google/gemini-flash-1.5-8b-exp`

---

## 📊 Performance

- **Bundle Size:** ~345KB (gzipped ~110KB)
- **First Load:** <2s on 3G
- **Lighthouse Score:** 95+ (Performance, Accessibility, Best Practices)

---

## 🤝 Contributing

Приветствуются любые улучшения!

1. Fork репозитория
2. Создайте ветку (`git checkout -b feature/amazing-feature`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

---

## 📝 License

MIT License - используйте свободно для личных и коммерческих проектов

---

## 🙏 Acknowledgments

- [OpenRouter](https://openrouter.ai/) за доступ к AI моделям
- [Google Gemini](https://ai.google.dev/) за мощную генерацию изображений
- [Tailwind CSS](https://tailwindcss.com/) за удобную стилизацию
- [Framer Motion](https://www.framer.com/motion/) за плавные анимации

---

<div align="center">

**Made with ❤️ by [BrianIS8090](https://github.com/BrianIS8090)**

[⬆ Back to Top](#️-видение)

</div>

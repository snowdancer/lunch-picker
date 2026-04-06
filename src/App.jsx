import { useState, useEffect } from 'react'
import {
  restaurants,
  CUISINE_OPTIONS,
  PAYMENT_OPTIONS,
  DAY_NAMES_JA,
  todayEn,
} from './data/restaurants'
import './App.css'

// ============================================================
// 天気コード（WMO）→ 日本語ラベル・絵文字変換マップ
// ============================================================
const WMO_WEATHER = {
  0:  { label: "快晴",           emoji: "☀️"  },
  1:  { label: "晴れ",           emoji: "🌤️" },
  2:  { label: "一部曇り",       emoji: "⛅"  },
  3:  { label: "曇り",           emoji: "☁️"  },
  45: { label: "霧",             emoji: "🌫️" },
  48: { label: "霧",             emoji: "🌫️" },
  51: { label: "小雨",           emoji: "🌦️" },
  53: { label: "雨",             emoji: "🌧️" },
  55: { label: "強雨",           emoji: "🌧️" },
  61: { label: "小雨",           emoji: "🌧️" },
  63: { label: "雨",             emoji: "🌧️" },
  65: { label: "大雨",           emoji: "🌧️" },
  71: { label: "小雪",           emoji: "🌨️" },
  73: { label: "雪",             emoji: "❄️"  },
  75: { label: "大雪",           emoji: "❄️"  },
  80: { label: "にわか雨",       emoji: "🌦️" },
  81: { label: "にわか雨",       emoji: "🌦️" },
  82: { label: "激しいにわか雨", emoji: "⛈️" },
  95: { label: "雷雨",           emoji: "⛈️" },
  99: { label: "激しい雷雨",     emoji: "⛈️" },
}

function getWeatherInfo(code) {
  return WMO_WEATHER[code] ?? { label: "不明", emoji: "🌡️" }
}

// 会社の座標（〒104-0033 東京都中央区新川１丁目２２）
const OFFICE_LAT = 35.6784
const OFFICE_LNG = 139.7836

// 気分スコアリング用のジャンル分類
const HEARTY_CUISINES = ["とんかつ", "焼肉", "ハンバーガー", "ラーメン", "中華料理", "インド料理", "カレー"]
const LIGHT_CUISINES  = ["うどん", "そば", "軽食・カフェ", "日本料理", "タイ料理", "パスタ", "イタリア料理"]

// 気分問卷の質問定義
const QUIZ_QUESTIONS = [
  {
    key: "appetite",
    question: "今日のランチの気分は？",
    options: [
      { value: "hearty", label: "🍖 がっつり食べたい" },
      { value: "light",  label: "🥗 さっぱりしたい"   },
      { value: "any",    label: "🤷 なんでもOK"        },
    ],
  },
  {
    key: "condition",
    question: "今日のコンディションは？",
    options: [
      { value: "fine",  label: "😊 元気バリバリ" },
      { value: "tired", label: "😩 疲れ気味…"   },
    ],
  },
]

// ============================================================
// メインアプリコンポーネント
// ============================================================
export default function App() {
  // フィルター状態
  const [maxWalk, setMaxWalk] = useState(10)
  const [cuisine, setCuisine] = useState("すべて")
  const [payment, setPayment] = useState("すべて")

  // 現在時刻（1分ごとに更新）
  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  // 天気情報
  const [weather, setWeather] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [weatherError, setWeatherError] = useState(false)
  useEffect(() => {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${OFFICE_LAT}&longitude=${OFFICE_LNG}` +
      `&current=temperature_2m,weather_code` +
      `&timezone=Asia%2FTokyo`
    fetch(url)
      .then(r => r.json())
      .then(data => { setWeather(data.current); setWeatherLoading(false) })
      .catch(() => { setWeatherError(true); setWeatherLoading(false) })
  }, [])

  // 推薦機能の状態
  const [recMode, setRecMode]       = useState(null)   // null | 'random' | 'quiz'
  const [quizStep, setQuizStep]     = useState(0)      // 0=未開始, 1〜2=質問中, 3=結果
  const [quizAnswers, setQuizAnswers] = useState({})
  const [picked, setPicked]         = useState(null)   // 選ばれた店舗

  /** 時刻を HH:MM 形式にフォーマット */
  const timeLabel = currentTime.toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  // フィルター適用済み店舗リスト（定休日は除外せず後ソート）
  const filtered = restaurants
    .filter(r => {
      if (r.walkingMinutes !== null && r.walkingMinutes > maxWalk) return false
      if (cuisine !== "すべて" && r.cuisine !== cuisine) return false
      if (payment !== "すべて" && !r.payment.includes(payment)) return false
      return true
    })
    .sort((a, b) => {
      const aClosed = a.closedDays.includes(todayEn)
      const bClosed = b.closedDays.includes(todayEn)
      if (aClosed === bClosed) return (a.walkingMinutes ?? 99) - (b.walkingMinutes ?? 99)
      return aClosed ? 1 : -1
    })

  // 本日営業中の店舗のみ（推薦対象）
  const available = filtered.filter(r => !r.closedDays.includes(todayEn))

  // ──────────────────────────────────────────
  // ランダム推薦
  // ──────────────────────────────────────────
  function pickRandom() {
    if (available.length === 0) return
    const r = available[Math.floor(Math.random() * available.length)]
    setPicked(r)
    setRecMode('random')
    setQuizStep(0)
    setQuizAnswers({})
  }

  // ──────────────────────────────────────────
  // 気分問卷推薦
  // ──────────────────────────────────────────
  function startQuiz() {
    setRecMode('quiz')
    setQuizStep(1)
    setQuizAnswers({})
    setPicked(null)
  }

  function answerQuiz(key, value) {
    const answers = { ...quizAnswers, [key]: value }
    setQuizAnswers(answers)

    if (quizStep < QUIZ_QUESTIONS.length) {
      setQuizStep(quizStep + 1)
    } else {
      // 全問回答済み → スコア計算して推薦
      setPicked(computeRecommendation(answers))
      setQuizStep(QUIZ_QUESTIONS.length + 1) // 結果ステップ
    }
  }

  /** 回答と天気をもとにスコアリングして最適な店舗を返す */
  function computeRecommendation(answers) {
    if (available.length === 0) return null

    // 天気が雨または気温15℃未満を「悪天候」と判定
    const isBadWeather = weather
      ? (weather.weather_code >= 51 || weather.temperature_2m < 15)
      : false

    const scored = available.map(r => {
      let score = 0

      // 気分スコア
      if (answers.appetite === 'hearty' && HEARTY_CUISINES.includes(r.cuisine)) score += 3
      if (answers.appetite === 'light'  && LIGHT_CUISINES.includes(r.cuisine))  score += 3

      // コンディション：疲れ気味 → 近い店を優先
      if (answers.condition === 'tired' && r.walkingMinutes !== null && r.walkingMinutes <= 5) score += 2

      // 悪天候 → 近い店を優先
      if (isBadWeather && r.walkingMinutes !== null && r.walkingMinutes <= 5) score += 1

      // Google評価ボーナス（3.5点基準）
      if (r.googleRating) score += (r.googleRating - 3.5)

      // 同点時のランダム差異
      score += Math.random() * 0.5

      return { r, score }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored[0].r
  }

  function resetRec() {
    setRecMode(null)
    setQuizStep(0)
    setQuizAnswers({})
    setPicked(null)
  }

  return (
    <div className="app">
      {/* ヘッダー */}
      <header className="app-header">
        <h1>🍱 今日のランチどこ行く？</h1>
        <p className="app-subtitle">今日は{DAY_NAMES_JA[todayEn]}曜日</p>
        <div className="info-bar">
          <span className="info-time">🕐 {timeLabel}</span>
          <span className="info-weather">
            {weatherLoading && "天気を取得中…"}
            {weatherError   && "天気情報を取得できませんでした"}
            {weather && (() => {
              const { label, emoji } = getWeatherInfo(weather.weather_code)
              return `${emoji} ${label}　${weather.temperature_2m}°C`
            })()}
          </span>
        </div>
      </header>

      {/* フィルターパネル */}
      <div className="filter-panel">
        <div className="filter-item">
          <label className="filter-label">🚶 徒歩時間</label>
          <div className="walk-options">
            {[3, 5, 8, 10].map(min => (
              <button
                key={min}
                className={`walk-btn ${maxWalk === min ? 'is-active' : ''}`}
                onClick={() => setMaxWalk(min)}
              >
                {min}分以内
              </button>
            ))}
          </div>
        </div>

        <div className="filter-row">
          <div className="filter-item">
            <label className="filter-label">🍽 ジャンル</label>
            <select value={cuisine} onChange={e => setCuisine(e.target.value)} className="filter-select">
              {CUISINE_OPTIONS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="filter-item">
            <label className="filter-label">💳 支払い</label>
            <select value={payment} onChange={e => setPayment(e.target.value)} className="filter-select">
              {PAYMENT_OPTIONS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── 推薦パネル ── */}
      <div className="rec-panel">
        {/* 推薦モード未選択 */}
        {recMode === null && (
          <div className="rec-actions">
            <button
              className="rec-btn rec-btn-random"
              onClick={pickRandom}
              disabled={available.length === 0}
            >
              🎲 ランダムで決める
            </button>
            <button
              className="rec-btn rec-btn-quiz"
              onClick={startQuiz}
              disabled={available.length === 0}
            >
              💬 気分で選んでもらう
            </button>
          </div>
        )}

        {/* 気分問卷：質問ステップ */}
        {recMode === 'quiz' && quizStep <= QUIZ_QUESTIONS.length && (() => {
          const q = QUIZ_QUESTIONS[quizStep - 1]
          return (
            <div className="quiz-box">
              <p className="quiz-step">Q{quizStep} / {QUIZ_QUESTIONS.length}</p>
              <p className="quiz-question">{q.question}</p>
              <div className="quiz-options">
                {q.options.map(opt => (
                  <button
                    key={opt.value}
                    className="quiz-option-btn"
                    onClick={() => answerQuiz(q.key, opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button className="rec-cancel" onClick={resetRec}>キャンセル</button>
            </div>
          )
        })()}

        {/* 推薦結果（ランダム or 問卷） */}
        {picked && (recMode === 'random' || quizStep > QUIZ_QUESTIONS.length) && (
          <div className="rec-result">
            <p className="rec-result-label">
              {recMode === 'random' ? '🎲 今日はここにしよう！' : '✨ あなたへのおすすめ'}
            </p>
            <RestaurantCard restaurant={picked} isClosed={false} isHighlighted />
            <div className="rec-result-actions">
              <button className="rec-btn rec-btn-random" onClick={pickRandom}>🎲 もう一回ランダム</button>
              <button className="rec-btn rec-btn-quiz"   onClick={startQuiz}>💬 もう一回問卷</button>
              <button className="rec-cancel"             onClick={resetRec}>閉じる</button>
            </div>
          </div>
        )}
      </div>

      {/* 検索結果件数 */}
      <p className="result-count">
        {filtered.length > 0
          ? `${filtered.length}件のお店が見つかりました`
          : "条件に合うお店が見つかりませんでした 😢"
        }
      </p>

      {/* レストランカード一覧 */}
      <div className="restaurant-list">
        {filtered.map(r => (
          <RestaurantCard
            key={r.id}
            restaurant={r}
            isClosed={r.closedDays.includes(todayEn)}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================
// レストランカードコンポーネント
// ============================================================
function RestaurantCard({ restaurant: r, isClosed, isHighlighted = false }) {
  return (
    <div className={`restaurant-card ${isClosed ? 'is-closed' : ''} ${isHighlighted ? 'is-highlighted' : ''}`}>

      {/* 画像エリア */}
      <div className="card-images">
        <div className="card-image-slot">
          {r.images.shop
            ? <img src={r.images.shop} alt={`${r.name} 店舗`} />
            : <div className="image-placeholder">🏠</div>
          }
          <span className="image-label">店舗</span>
        </div>
        <div className="card-image-slot">
          {r.images.dish
            ? <img src={r.images.dish} alt={`${r.name} 料理`} />
            : <div className="image-placeholder">🍽️</div>
          }
          <span className="image-label">料理</span>
        </div>
        {isClosed && <div className="closed-badge">本日定休</div>}
      </div>

      {/* 店舗情報 */}
      <div className="card-body">
        <div className="card-header">
          <h2 className="card-name">{r.name}</h2>
          <span className="tag tag-cuisine">{r.cuisine}</span>
          {r.googleRating && (
            <span className="tag tag-rating">⭐ {r.googleRating}</span>
          )}
        </div>

        <div className="card-details">
          <div className="detail-row">
            <span className="detail-icon">🚶</span>
            <span>{r.walkingMinutes !== null ? `徒歩 ${r.walkingMinutes}分` : "徒歩 不明"}</span>
          </div>
          <div className="detail-row">
            <span className="detail-icon">💰</span>
            <span>{r.priceRange}</span>
          </div>
          {r.seats !== null && (
            <div className="detail-row">
              <span className="detail-icon">🪑</span>
              <span>{r.seats}席</span>
            </div>
          )}
          <div className="detail-row">
            <span className="detail-icon">💳</span>
            <span>{r.payment.join("・")}</span>
          </div>
          {r.lunchHours && (
            <div className="detail-row">
              <span className="detail-icon">🕐</span>
              <span>ランチ {r.lunchHours}</span>
            </div>
          )}
          {r.closedDays.length > 0 && (
            <div className="detail-row">
              <span className="detail-icon">🚫</span>
              <span>定休：{r.closedDays.map(d => DAY_NAMES_JA[d]).join("・")}</span>
            </div>
          )}
          {r.address && (
            <div className="detail-row">
              <span className="detail-icon">📍</span>
              <span className="detail-address">{r.address}</span>
            </div>
          )}
        </div>

        {r.note && <p className="card-note">📝 {r.note}</p>}
      </div>
    </div>
  )
}

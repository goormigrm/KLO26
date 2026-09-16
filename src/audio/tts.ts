// 경기 중계 음성 (TTS) — **브라우저 내장 `speechSynthesis`** 만 쓴다 (2026-09-16, 사용자 요청 "남자 한국 TTS 무료").
//
// 왜 이것인가
// - 공짜 · 오프라인 · 키 없음 · 설치 없음. 외부 TTS 서비스는 요금·API 키·네트워크가 붙고, 미리 녹음한 음성 파일은
//   이 게임의 원칙(음원 파일 0개 — DESIGN 7.3)에 어긋난다. 무엇보다 **선수 1,056명의 이름**을 미리 녹음할 수 없다.
// - 운영체제 음성을 그대로 쓰므로 보호명도 그대로 읽는다.
//
// 남성 목소리
// - 한국어 **남성** 음성(윈도우 `Microsoft InJoon` 등)이 깔려 있으면 그것을 고른다.
// - 없으면(2026-09-16 이 노트북은 `Microsoft Heami` 여성 하나뿐이었다) **피치를 내려**(0.55) 남성에 가깝게 읽는다.
//   진짜 남성 음성을 원하면 윈도우 설정 → 시간 및 언어 → 음성 → 음성 추가 에서 한국어(대한민국) 음성을 받으면
//   다음 실행부터 저절로 잡는다. `voiceLabel()` 이 지금 무엇으로 읽는지 설정 화면에 보여 준다.
//
// 언제 말하나 — **하이라이트만**. 사용자 요청: "경기중에 계속은 아니고, 중간중간".
// 골·페널티킥·퇴장·선방·골대·전후반 시작과 종료·추가시간처럼 장면이 끊기는 순간에만 한 줄씩 얹는다.
// 파울·슛·태클처럼 판당 10번 넘게 나는 것은 **말하지 않는다**(효과음이 이미 있다).
//
// 결정론과 무관하다 — sim 을 건드리지 않고 이벤트를 읽어 말만 한다. 난수도 `Math.random`(렌더 쪽이라 허용)이고
// 온라인에서도 각자 브라우저에서 따로 난다.

import { type GameState, type SimEvent } from '../core/state'

const STORAGE_KEY = 'klo26.voice'

/** 말의 급 — 2 하이라이트(하던 말을 끊는다) · 1 볼 만한 장면 · 0 곁들이는 말 */
type Prio = 0 | 1 | 2

/** 한국어 **남성** 음성으로 알려진 이름들 (윈도우·엣지·크롬) */
const MALE_HINTS = ['injoon', 'in-joon', 'male', '남성', 'hyunsu', 'hyun-su', 'bongjin', 'gookmin']
/** 한국어 여성 음성 — 이게 잡히면 피치를 내린다 */
const FEMALE_HINTS = ['heami', 'sunhi', 'yuna', 'female', '여성', 'jimin', 'seoyeon']

function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)] ?? a[0]
}

export interface VoiceInfo {
  name: string
  male: boolean
  ok: boolean
}

export class MatchVoice {
  private ss: SpeechSynthesis | null = null
  private voice: SpeechSynthesisVoice | null = null
  /** 고른 음성이 남성인가 — 아니면 피치를 내려 읽는다 */
  private male = false
  private onVoices: (() => void) | null = null
  private enabledFlag: boolean
  private mutedFlag = false
  /** 마지막으로 말을 시작한 시각(ms) */
  private lastAt = -1e9
  /** 페널티킥이 선언된 틱 — 곧 이어지는 골을 "페널티킥 성공"으로 읽는다 */
  private penTick = -1e9
  /** 하프별로 시작 멘트를 한 번만 */
  private startedHalf = 0

  constructor(enabled = true) {
    let e = enabled
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw !== null) e = raw === '1'
    } catch {
      // 저장소가 없어도 중계는 된다
    }
    this.enabledFlag = e
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    this.ss = window.speechSynthesis
    this.resolveVoice()
    // 음성 목록은 비동기로 온다 — 처음 getVoices() 가 빈 배열일 수 있다
    this.onVoices = () => this.resolveVoice()
    this.ss.addEventListener('voiceschanged', this.onVoices)
  }

  /**
   * 음성 목록은 **비동기로** 온다 — 크롬은 첫 `getVoices()` 가 빈 배열이고 잠시 뒤 `voiceschanged` 가 뜬다.
   * 설정 패널은 그 전에 한 번 그려지므로, 아직 못 찾았으면 물어볼 때마다 다시 찾는다 (2026-09-16 실측).
   */
  private ensureVoice(): void {
    if (!this.voice) this.resolveVoice()
  }

  /** 이 브라우저가 한국어를 읽을 수 있나 */
  get available(): boolean {
    this.ensureVoice()
    return this.ss !== null && this.voice !== null
  }

  get enabled(): boolean {
    return this.enabledFlag
  }

  setEnabled(v: boolean): void {
    this.enabledFlag = v
    try {
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
    } catch {
      // 무시
    }
    if (!v) this.cancel()
  }

  /** 소리 전체를 끄면 중계도 멈춘다 */
  setMuted(v: boolean): void {
    this.mutedFlag = v
    if (v) this.cancel()
  }

  /** 설정 화면에 보여 줄 "지금 무엇으로 읽는가" */
  info(): VoiceInfo {
    this.ensureVoice()
    if (!this.ss) return { name: '이 브라우저는 음성 합성을 지원하지 않습니다', male: false, ok: false }
    if (!this.voice) return { name: '한국어 음성이 없습니다 (윈도우 설정 → 음성에서 추가)', male: false, ok: false }
    return { name: this.voice.name, male: this.male, ok: true }
  }

  /** 한국어 음성 고르기 — 남성이 있으면 남성, 없으면 피치를 내려 쓸 음성 */
  private resolveVoice(): void {
    if (!this.ss) return
    const all = this.ss.getVoices()
    let best: SpeechSynthesisVoice | null = null
    let bestScore = -1e9
    for (const v of all) {
      const lang = (v.lang || '').toLowerCase()
      if (!lang.startsWith('ko')) continue
      const n = (v.name || '').toLowerCase()
      let s = lang.startsWith('ko-kr') ? 10 : 6
      if (MALE_HINTS.some((h) => n.includes(h))) s += 20
      if (FEMALE_HINTS.some((h) => n.includes(h))) s -= 8
      // 로컬 음성이 안전하다 — 네트워크 음성은 끊기면 말이 안 나온다
      if (v.localService) s += 3
      if (s > bestScore) {
        bestScore = s
        best = v
      }
    }
    this.voice = best
    const n = (best?.name ?? '').toLowerCase()
    this.male = best !== null && MALE_HINTS.some((h) => n.includes(h))
  }

  cancel(): void {
    try {
      this.ss?.cancel()
    } catch {
      // 무시
    }
  }

  /**
   * 한 줄 말한다. 급(prio)에 따라 끼어들거나 건너뛴다 — 겹쳐 말하지 않는 것이 제일 중요하다.
   * · 2 하이라이트: 하던 말을 끊고 바로
   * · 1 볼 만한 장면: 말하는 중이 아니고 3.5초 지났으면
   * · 0 곁들이는 말: 9초 넘게 조용했고 동전 던지기에 맞았을 때만
   */
  private say(text: string, prio: Prio = 1): void {
    if (!this.enabledFlag || this.mutedFlag || !this.ss) return
    this.ensureVoice()
    if (!this.voice) return
    // 탭이 숨겨져 있으면 말이 큐에 쌓였다가 돌아올 때 한꺼번에 터진다
    if (typeof document !== 'undefined' && document.hidden) return
    const now = performance.now()
    const busy = this.ss.speaking || this.ss.pending
    if (prio === 2) {
      if (busy) this.cancel()
    } else if (prio === 1) {
      if (busy || now - this.lastAt < 3500) return
    } else {
      if (busy || now - this.lastAt < 9000 || Math.random() < 0.45) return
    }
    const u = new SpeechSynthesisUtterance(text)
    u.voice = this.voice
    u.lang = this.voice.lang || 'ko-KR'
    // 남성 음성이면 그대로, 여성 음성뿐이면 피치를 내려 남성에 가깝게 (2026-09-16 실측: 0.55 에서 확실히 낮아진다)
    u.pitch = this.male ? 0.95 : 0.55
    u.rate = 1.08 // 중계답게 조금 빠르게
    u.volume = 1
    this.lastAt = now
    try {
      this.ss.speak(u)
    } catch {
      // 자동재생 정책 등 — 말 못 해도 경기는 돈다
    }
  }

  /** "울산 2 대 0 전북" */
  private score(st: GameState): string {
    return `${st.teams[0].short} ${st.teams[0].goals} 대 ${st.teams[1].goals} ${st.teams[1].short}`
  }

  private nameOf(st: GameState, idx: number): string {
    return idx >= 0 && idx < st.players.length ? st.players[idx].spec.name : ''
  }

  /** 새 경기 — 하프 멘트·페널티 기억을 되돌린다 */
  reset(): void {
    this.startedHalf = 0
    this.penTick = -1e9
    this.cancel()
  }

  /**
   * sim 이벤트 → 중계 한 줄. `from` 부터 끝까지 본다 (`Sfx.onEvents` 와 같은 자리에서 불린다).
   * 상태(이름·점수)를 읽기만 하고 바꾸지 않는다.
   */
  onEvents(st: GameState, events: SimEvent[], from: number): void {
    if (!this.enabledFlag || this.mutedFlag || !this.available) return
    for (let i = from; i < events.length; i++) {
      const e = events[i]
      switch (e.type) {
        case 'goal': {
          const who = this.nameOf(st, e.player)
          const pk = st.tick - this.penTick < 900 // 15초 안에 선언된 페널티킥이면 그 골이다
          this.penTick = -1e9
          let line: string
          if (!who) line = pick(['골! 자책골로 기록됩니다.', '아, 자기 골문으로 들어갑니다.'])
          else if (pk) line = pick([`페널티킥, 성공입니다! ${who}.`, `${who}, 침착하게 성공시킵니다!`])
          else line = pick([`골! ${who}!`, `들어갔습니다, ${who}!`, `${who}, 골을 넣습니다!`, `골인! ${who}!`])
          this.say(`${line} ${this.score(st)}.`, 2)
          break
        }
        case 'penalty':
          this.penTick = st.tick
          this.say(pick(['페널티킥이 선언됩니다!', '페널티킥! 주심이 스팟을 가리킵니다.']), 2)
          break
        case 'card': {
          const who = this.nameOf(st, e.player)
          if ((e.n ?? 1) >= 2) this.say(`퇴장입니다! ${who}, 레드카드.`, 2)
          else this.say(`${who}, 경고를 받습니다.`, 1)
          break
        }
        case 'save': {
          const gk = this.nameOf(st, e.player)
          this.say(pick(['막아 냅니다!', '골키퍼, 선방!', `${gk}, 잡아 냅니다!`, '결정적인 선방입니다!']), 1)
          break
        }
        case 'post':
          this.say(pick(['골대를 때립니다!', '아, 골포스트!', '골대 맞고 나옵니다!']), 1)
          break
        case 'corner':
          this.say('코너킥입니다.', 0)
          break
        case 'whistle':
          // 킥오프 휘슬은 골 뒤에도 난다 — **하프 시작**일 때만 (rules.ts 가 자막을 가르는 조건과 같다)
          if (st.clock < 1 && this.startedHalf !== st.half) {
            this.startedHalf = st.half
            this.say(st.half === 1 ? '전반 시작합니다.' : '후반 시작합니다.', 2)
          }
          break
        case 'added':
          this.say(`추가시간 ${e.n ?? 1}분입니다.`, 1)
          break
        case 'half':
          this.say(`전반 종료. ${this.score(st)}.`, 2)
          break
        case 'end': {
          const a = st.teams[0].goals
          const b = st.teams[1].goals
          const tail = a === b ? '무승부입니다.' : `${st.teams[a > b ? 0 : 1].short}, 승리입니다.`
          this.say(`경기 종료! ${this.score(st)}. ${tail}`, 2)
          break
        }
        case 'offside':
          this.say('오프사이드입니다.', 0)
          break
        case 'sub':
          this.say('교체 투입입니다.', 0)
          break
        default:
          break
      }
    }
  }

  dispose(): void {
    this.cancel()
    if (this.ss && this.onVoices) this.ss.removeEventListener('voiceschanged', this.onVoices)
    this.onVoices = null
  }
}

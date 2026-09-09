// 레이더 — 전체 피치 축소, 22명 점, 공 (DESIGN 7.1 "레이더 필수"). 2D 캔버스. sim 을 바꾸지 않는다.
// 방향은 카메라와 같다 — 오른쪽 = +x, 위 = +y.

import { BOX_HALF_W, BOX_L, HALF_L, HALF_W, type GameState } from '../core/state'

export const RADAR_W = 236
export const RADAR_H = 156

export class Radar {
  readonly canvas: HTMLCanvasElement
  private g: CanvasRenderingContext2D
  private dpr = 1

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'radar'
    parent.appendChild(this.canvas)
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = RADAR_W * this.dpr
    this.canvas.height = RADAR_H * this.dpr
    this.canvas.style.width = `${RADAR_W}px`
    this.canvas.style.height = `${RADAR_H}px`
    this.g = this.canvas.getContext('2d')!
  }

  draw(st: GameState, colors: [string, string], controlled: number): void {
    const g = this.g
    const d = this.dpr
    g.setTransform(d, 0, 0, d, 0, 0)
    g.clearRect(0, 0, RADAR_W, RADAR_H)
    const pad = 10
    const sx = (RADAR_W - pad * 2) / (HALF_L * 2)
    const sy = (RADAR_H - pad * 2) / (HALF_W * 2)
    const X = (x: number): number => pad + (x + HALF_L) * sx
    const Y = (y: number): number => pad + (HALF_W - y) * sy
    g.fillStyle = 'rgba(8,12,18,0.72)'
    g.beginPath()
    g.roundRect(0, 0, RADAR_W, RADAR_H, 10)
    g.fill()
    g.fillStyle = 'rgba(46,160,67,0.28)'
    g.fillRect(X(-HALF_L), Y(HALF_W), HALF_L * 2 * sx, HALF_W * 2 * sy)
    g.strokeStyle = 'rgba(255,255,255,0.45)'
    g.lineWidth = 1
    g.strokeRect(X(-HALF_L), Y(HALF_W), HALF_L * 2 * sx, HALF_W * 2 * sy)
    g.beginPath()
    g.moveTo(X(0), Y(HALF_W))
    g.lineTo(X(0), Y(-HALF_W))
    g.stroke()
    g.beginPath()
    g.arc(X(0), Y(0), 9.15 * sx, 0, Math.PI * 2)
    g.stroke()
    for (const s of [-1, 1]) {
      g.strokeRect(Math.min(X(s * HALF_L), X(s * (HALF_L - BOX_L))), Y(BOX_HALF_W), BOX_L * sx, BOX_HALF_W * 2 * sy)
    }
    for (const p of st.players) {
      if (p.sentOff) continue
      const r = p.idx === controlled ? 4 : 2.6
      g.fillStyle = colors[p.team]
      g.beginPath()
      g.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2)
      g.fill()
      if (p.idx === controlled) {
        g.strokeStyle = '#ffe14a'
        g.lineWidth = 1.5
        g.stroke()
      }
    }
    const b = st.ball
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(X(b.x), Y(b.y), 2.2, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#000'
    g.lineWidth = 0.8
    g.stroke()
  }

  dispose(): void {
    this.canvas.remove()
  }
}

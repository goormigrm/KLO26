// 별점 HTML — 숫자 대신 ★ 5개 (반 개 단위). 회색 별 위에 금색 별을 폭으로 잘라 얹는다.

/** v: 0.5~5 */
export function starHtml(v: number, small = false): string {
  const w = Math.round((v / 5) * 100)
  return `<span class="stars${small ? ' sm' : ''}" title="${v} / 5"><span class="bg">★★★★★</span><span class="fg" style="width:${w}%">★★★★★</span></span>`
}

/**
 * 능력치 눈금 여섯 — 별과 같은 5단계(반 칸 단위)를 칸 다섯으로. 목록에서 한눈에 읽힌다 (2026-09-11).
 * stars: 0.5~5 로 바꿔 넣는다. 제목(title)에는 우리말 항목명과 별 수를 적는다.
 */
export function pipsHtml(stars: number[], labels: readonly [string, string][]): string {
  const cell = (v: number, i: number): string => {
    let s = ''
    for (let k = 1; k <= 5; k++) s += `<i class="${v >= k ? 'f' : v >= k - 0.5 ? 'h' : ''}"></i>`
    return `<span class="pip" title="${labels[i]?.[1] ?? ''} ${v}/5">${s}</span>`
  }
  return `<em class="pips">${stars.map(cell).join('')}</em>`
}

/** 목록용 작은 막대 여섯 — 값은 0~99, 숫자는 안 보여 준다 (2026-09-11 부터는 pipsHtml 을 쓴다) */
export function miniBars(values: number[], labels: readonly [string, string][]): string {
  // 클래스 이름은 `sixbars` — 로비 급여 게이지 `.mini` 와 겹쳐 게이지가 24px 로 쪼그라든 적이 있다 (2026-09-11)
  return `<em class="sixbars">${values.map((v, i) => `<i title="${labels[i]?.[1] ?? ''}" style="--w:${Math.round(v)}%"></i>`).join('')}</em>`
}

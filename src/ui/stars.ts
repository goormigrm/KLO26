// 별점 HTML — 숫자 대신 ★ 5개 (반 개 단위). 회색 별 위에 금색 별을 폭으로 잘라 얹는다.

/** v: 0.5~5 */
export function starHtml(v: number, small = false): string {
  const w = Math.round((v / 5) * 100)
  return `<span class="stars${small ? ' sm' : ''}" title="${v} / 5"><span class="bg">★★★★★</span><span class="fg" style="width:${w}%">★★★★★</span></span>`
}

/** 목록용 작은 막대 여섯 — 값은 0~99, 숫자는 안 보여 준다 */
export function miniBars(values: number[], labels: readonly [string, string][]): string {
  return `<em class="mini">${values.map((v, i) => `<i title="${labels[i]?.[1] ?? ''}" style="--w:${Math.round(v)}%"></i>`).join('')}</em>`
}

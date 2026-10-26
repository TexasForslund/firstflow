/** Gemener utan accenter, så att "ostlund" hittar "Östlund". */
export function matches(text: string, query: string) {
  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return norm(text).includes(norm(query.trim()))
}

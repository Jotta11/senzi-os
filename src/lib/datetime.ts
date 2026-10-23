const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Araguaina',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** dd/mm/aaaa HH:mm no fuso da loja (America/Araguaina). */
export function formatDateTime(iso: string): string {
  const p = Object.fromEntries(dateTimeFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}

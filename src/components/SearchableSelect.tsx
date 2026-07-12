import { useEffect, useRef, useState } from 'react'

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  placeholder?: string
  className?: string
}

export default function SearchableSelect({ value, onChange, options, placeholder, className }: SearchableSelectProps) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => setQuery(value), [value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  function select(name: string) {
    onChange(name)
    setQuery(name)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          onChange(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((h) => Math.min(h + 1, filtered.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => Math.max(h - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (filtered[highlight]) select(filtered[highlight])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        placeholder={placeholder}
        className={className ?? 'input'}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
          {filtered.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(name)}
                className={`w-full text-left px-3 py-1.5 text-sm ${i === highlight ? 'bg-buu-tint text-buu' : 'hover:bg-slate-50'}`}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

import React, { useState, useRef, useEffect } from 'react';
import { CalendarDays, Clock, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DateTimePickerProps {
  id?: string;
  name?: string;
  value: string;             // ISO string or ""
  onChange: (iso: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  minDate?: Date;
}

const DAYS   = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function pad(n: number) { return String(n).padStart(2, '0'); }

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DateTimePicker({
  id, name, value, onChange, placeholder = 'Select date & time',
  required = false, className = '', minDate,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed  = value ? new Date(value) : null;

  const now     = new Date();
  const minD    = minDate ?? now;

  const [viewYear,  setViewYear]  = useState(parsed?.getFullYear()  ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth()     ?? now.getMonth());
  const [selDate,   setSelDate]   = useState<Date | null>(parsed);
  const [hour,      setHour]      = useState(parsed?.getHours()     ?? now.getHours());
  const [minute,    setMinute]    = useState(parsed ? Math.floor(parsed.getMinutes()/5)*5 : Math.ceil(now.getMinutes()/5)*5 % 60);

  const containerRef = useRef<HTMLDivElement>(null);

  /* close on outside click */
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  /* build calendar grid */
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev  = new Date(viewYear, viewMonth, 0).getDate();
  const cells: { day: number; month: 'prev'|'cur'|'next'; date: Date }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    cells.push({ day: d, month: 'prev', date: new Date(viewYear, viewMonth-1, d) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month: 'cur', date: new Date(viewYear, viewMonth, d) });
  }
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: next, month: 'next', date: new Date(viewYear, viewMonth+1, next) });
    next++;
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y-1); setViewMonth(11); }
    else setViewMonth(m => m-1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y+1); setViewMonth(0); }
    else setViewMonth(m => m+1);
  }

  function isDisabled(date: Date) {
    const d = new Date(date); d.setHours(0,0,0,0);
    const m = new Date(minD); m.setHours(0,0,0,0);
    return d < m;
  }
  function isSelected(date: Date) {
    return selDate
      ? date.getFullYear() === selDate.getFullYear() &&
        date.getMonth()    === selDate.getMonth()    &&
        date.getDate()     === selDate.getDate()
      : false;
  }
  function isToday(date: Date) {
    return date.getFullYear() === now.getFullYear() &&
           date.getMonth()    === now.getMonth()    &&
           date.getDate()     === now.getDate();
  }

  function pickDay(cell: typeof cells[number]) {
    if (isDisabled(cell.date)) return;
    setSelDate(cell.date);
    if (cell.month === 'prev') { prevMonth(); }
    if (cell.month === 'next') { nextMonth(); }
  }

  function confirm() {
    if (!selDate) return;
    const dt = new Date(selDate);
    dt.setHours(hour, minute, 0, 0);
    onChange(toLocalISO(dt));
    setOpen(false);
  }

  function clear() {
    setSelDate(null);
    onChange('');
  }

  const displayValue = parsed
    ? `${pad(parsed.getDate())} ${MONTHS[parsed.getMonth()].slice(0,3)} ${parsed.getFullYear()}  ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
    : '';

  const minutes5 = Array.from({ length: 12 }, (_, i) => i * 5);
  const hours24  = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Hidden input for form submission */}
      <input type="hidden" id={id} name={name} value={value} required={required} />

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="
          w-full flex items-center gap-3 px-4 py-2.5 rounded-xl
          bg-[#0f1117] border border-white/10
          text-sm text-left
          hover:border-emerald-500/50 hover:bg-[#131620]
          focus:outline-none focus:border-emerald-500
          transition-all duration-200
          shadow-[0_2px_12px_rgba(0,0,0,0.4)]
        "
      >
        <CalendarDays className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className={displayValue ? 'text-white' : 'text-zinc-500'}>
          {displayValue || placeholder}
        </span>
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); clear(); }}
            className="ml-auto text-zinc-500 hover:text-white transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </button>

      {/* Picker panel */}
      {open && (
        <div
          className="
            absolute z-50 top-full mt-2 left-0
            w-full min-w-[320px]
            rounded-2xl overflow-hidden
            border border-white/10
            shadow-[0_24px_64px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)]
            bg-gradient-to-b from-[#12151e] to-[#0c0f17]
          "
          style={{ backdropFilter: 'blur(20px)' }}
        >
          {/* ── Calendar header ── */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-white tracking-wide">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* ── Day headers ── */}
          <div className="grid grid-cols-7 px-4 pb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-zinc-600 py-1 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* ── Day grid ── */}
          <div className="grid grid-cols-7 gap-0.5 px-4 pb-4">
            {cells.map((cell, i) => {
              const disabled = isDisabled(cell.date) || cell.month !== 'cur';
              const selected = isSelected(cell.date);
              const today    = isToday(cell.date);

              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickDay(cell)}
                  className={`
                    relative h-9 w-full rounded-xl text-xs font-medium transition-all duration-150
                    flex items-center justify-center
                    ${disabled
                      ? 'text-zinc-700 cursor-not-allowed'
                      : selected
                        ? 'bg-emerald-500 text-white shadow-[0_4px_12px_rgba(16,185,129,0.5)] scale-110 font-bold'
                        : today
                          ? 'bg-white/10 text-emerald-400 font-semibold hover:bg-emerald-500/20'
                          : 'text-zinc-300 hover:bg-white/10 hover:text-white hover:scale-105'
                    }
                  `}
                >
                  {cell.day}
                  {today && !selected && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Divider ── */}
          <div className="h-px bg-white/5 mx-4" />

          {/* ── Time picker ── */}
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Time</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Hour drum */}
              <div className="flex-1">
                <div className="text-[10px] text-zinc-600 mb-1.5 text-center uppercase tracking-wider">Hour</div>
                <div className="
                  h-24 overflow-y-auto rounded-xl bg-black/40 border border-white/8
                  scroll-smooth
                  [&::-webkit-scrollbar]:hidden
                ">
                  {hours24.map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHour(h)}
                      className={`
                        w-full py-1.5 text-sm text-center transition-all duration-100
                        ${h === hour
                          ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                          : 'text-zinc-400 hover:bg-white/8 hover:text-white'
                        }
                      `}
                    >
                      {pad(h)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-2xl font-light text-zinc-600 pb-2">:</div>

              {/* Minute drum */}
              <div className="flex-1">
                <div className="text-[10px] text-zinc-600 mb-1.5 text-center uppercase tracking-wider">Min</div>
                <div className="
                  h-24 overflow-y-auto rounded-xl bg-black/40 border border-white/8
                  [&::-webkit-scrollbar]:hidden
                ">
                  {minutes5.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMinute(m)}
                      className={`
                        w-full py-1.5 text-sm text-center transition-all duration-100
                        ${m === minute
                          ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                          : 'text-zinc-400 hover:bg-white/8 hover:text-white'
                        }
                      `}
                    >
                      {pad(m)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live preview */}
              <div className="flex-1 flex flex-col items-center justify-center gap-1">
                <div className="
                  w-full rounded-xl bg-emerald-500/10 border border-emerald-500/20
                  flex flex-col items-center justify-center py-3
                ">
                  <span className="text-2xl font-bold text-emerald-400 tabular-nums tracking-tight">
                    {pad(hour)}:{pad(minute)}
                  </span>
                  {selDate && (
                    <span className="text-[10px] text-zinc-500 mt-1">
                      {MONTHS[selDate.getMonth()].slice(0,3)} {selDate.getDate()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Action buttons ── */}
          <div className="flex gap-2 px-5 pb-5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="
                flex-1 py-2.5 rounded-xl text-sm font-medium
                bg-white/5 border border-white/10 text-zinc-400
                hover:bg-white/10 hover:text-white transition-all
              "
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!selDate}
              className="
                flex-1 py-2.5 rounded-xl text-sm font-semibold text-white
                bg-gradient-to-r from-emerald-600 to-emerald-500
                shadow-[0_4px_16px_rgba(16,185,129,0.4)]
                disabled:opacity-40 disabled:cursor-not-allowed
                hover:shadow-[0_4px_20px_rgba(16,185,129,0.6)] hover:scale-[1.02]
                transition-all duration-200
              "
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

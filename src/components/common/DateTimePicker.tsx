import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DateTimePickerProps {
  id?: string;
  name?: string;
  value: string;
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

function toLocalISO(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DateTimePicker({
  id, name, value, onChange,
  placeholder = 'Select date & time',
  required = false, className = '', minDate,
}: DateTimePickerProps) {
  const [open, setOpen]     = useState(false);
  const [rect,  setRect]    = useState<DOMRect | null>(null);
  const triggerRef          = useRef<HTMLButtonElement>(null);
  const panelRef            = useRef<HTMLDivElement>(null);

  const parsed = value ? new Date(value) : null;
  const now    = new Date();
  const minD   = minDate ?? now;

  const [viewYear,  setViewYear]  = useState(parsed?.getFullYear()  ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth()     ?? now.getMonth());
  const [selDate,   setSelDate]   = useState<Date | null>(parsed);
  const [hour,      setHour]      = useState(parsed?.getHours()     ?? now.getHours());
  const [minute,    setMinute]    = useState(
    parsed ? Math.floor(parsed.getMinutes() / 5) * 5 : Math.ceil(now.getMinutes() / 5) * 5 % 60
  );

  // Position dropdown relative to trigger using fixed coords
  const openPicker = () => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setOpen(o => !o);
  };

  // Reposition on scroll/resize
  const updateRect = useCallback(() => {
    if (open && triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
  }, [open]);

  useEffect(() => {
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [updateRect]);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  /* ── Calendar grid ── */
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev  = new Date(viewYear, viewMonth, 0).getDate();
  const cells: { day: number; month: 'prev'|'cur'|'next'; date: Date }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    cells.push({ day: d, month: 'prev', date: new Date(viewYear, viewMonth - 1, d) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month: 'cur', date: new Date(viewYear, viewMonth, d) });
  }
  let nxt = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: nxt, month: 'next', date: new Date(viewYear, viewMonth + 1, nxt++) });
  }

  const prevMonth = () => viewMonth === 0  ? (setViewYear(y => y-1), setViewMonth(11)) : setViewMonth(m => m-1);
  const nextMonth = () => viewMonth === 11 ? (setViewYear(y => y+1), setViewMonth(0))  : setViewMonth(m => m+1);

  const isDisabled = (d: Date) => { const a = new Date(d); a.setHours(0,0,0,0); const b = new Date(minD); b.setHours(0,0,0,0); return a < b; };
  const isSelected = (d: Date) => selDate
    ? d.getFullYear() === selDate.getFullYear() && d.getMonth() === selDate.getMonth() && d.getDate() === selDate.getDate()
    : false;
  const isToday = (d: Date) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();

  function pickDay(cell: typeof cells[number]) {
    if (isDisabled(cell.date)) return;
    setSelDate(cell.date);
    if (cell.month === 'prev') prevMonth();
    if (cell.month === 'next') nextMonth();
  }

  function confirm() {
    if (!selDate) return;
    const dt = new Date(selDate);
    dt.setHours(hour, minute, 0, 0);
    onChange(toLocalISO(dt));
    setOpen(false);
  }

  function clear() { setSelDate(null); onChange(''); }

  const displayValue = parsed
    ? `${pad(parsed.getDate())} ${MONTHS[parsed.getMonth()].slice(0,3)} ${parsed.getFullYear()}  ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
    : '';

  const hours24  = Array.from({ length: 24 }, (_, i) => i);
  const minutes5 = Array.from({ length: 12 }, (_, i) => i * 5);

  /* ── Panel placement ── */
  const panelStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        top: rect.bottom + 6,
        left: rect.left,
        width: Math.max(rect.width, 520),
        zIndex: 9999,
      }
    : { display: 'none' };

  /* ── Portal panel ── */
  const panel = open ? createPortal(
    <div
      ref={panelRef}
      style={panelStyle}
      className="
        rounded-xl overflow-hidden
        border border-white/10
        shadow-[0_16px_48px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)]
        bg-gradient-to-br from-[#12151e] to-[#0c0f17]
      "
    >
      {/* ── Two-column layout ── */}
      <div className="flex">

        {/* LEFT — Calendar */}
        <div className="flex-1 min-w-0 p-3">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth}
              className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-all">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-semibold text-white tracking-wide">
              {MONTHS[viewMonth].slice(0,3)} {viewYear}
            </span>
            <button type="button" onClick={nextMonth}
              className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-all">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-0.5">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[9px] font-semibold text-zinc-600 py-0.5 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) => {
              const disabled = isDisabled(cell.date) || cell.month !== 'cur';
              const selected = isSelected(cell.date);
              const today    = isToday(cell.date);
              return (
                <button key={i} type="button" disabled={disabled} onClick={() => pickDay(cell)}
                  className={`
                    relative h-6 w-full rounded text-[11px] font-medium transition-all duration-150
                    flex items-center justify-center
                    ${disabled
                      ? 'text-zinc-700 cursor-not-allowed'
                      : selected
                        ? 'bg-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.5)] font-bold'
                        : today
                          ? 'bg-white/10 text-emerald-400 font-semibold hover:bg-emerald-500/20'
                          : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                    }
                  `}
                >
                  {cell.day}
                  {today && !selected && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-0.5 h-0.5 rounded-full bg-emerald-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Vertical divider */}
        <div className="w-px bg-white/5 my-3" />

        {/* RIGHT — Time drums */}
        <div className="w-[160px] shrink-0 p-3 flex flex-col gap-2">
          <div className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Time</div>

          <div className="flex items-start gap-1.5">
            {/* Hour */}
            <div className="flex-1">
              <div className="text-[9px] text-zinc-600 mb-1 text-center uppercase tracking-wider">Hr</div>
              <div className="h-[120px] overflow-y-auto rounded-lg bg-black/40 border border-white/8 [&::-webkit-scrollbar]:hidden scroll-smooth">
                {hours24.map(h => (
                  <button key={h} type="button" onClick={() => setHour(h)}
                    className={`w-full py-1 text-xs text-center transition-colors duration-100
                      ${h === hour ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                  >{pad(h)}</button>
                ))}
              </div>
            </div>

            <div className="text-zinc-600 text-lg font-light mt-6">:</div>

            {/* Minute */}
            <div className="flex-1">
              <div className="text-[9px] text-zinc-600 mb-1 text-center uppercase tracking-wider">Min</div>
              <div className="h-[120px] overflow-y-auto rounded-lg bg-black/40 border border-white/8 [&::-webkit-scrollbar]:hidden">
                {minutes5.map(m => (
                  <button key={m} type="button" onClick={() => setMinute(m)}
                    className={`w-full py-1 text-xs text-center transition-colors duration-100
                      ${m === minute ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                  >{pad(m)}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="mt-auto rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex flex-col items-center justify-center py-2">
            <span className="text-lg font-bold text-emerald-400 tabular-nums">{pad(hour)}:{pad(minute)}</span>
            {selDate && (
              <span className="text-[9px] text-zinc-500 mt-0.5">
                {MONTHS[selDate.getMonth()].slice(0,3)} {selDate.getDate()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Action row ── */}
      <div className="flex gap-2 px-3 pb-3">
        <button type="button" onClick={() => setOpen(false)}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white transition-all">
          Cancel
        </button>
        <button type="button" onClick={confirm} disabled={!selDate}
          className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white
            bg-gradient-to-r from-emerald-600 to-emerald-500
            shadow-[0_2px_12px_rgba(16,185,129,0.4)]
            disabled:opacity-40 disabled:cursor-not-allowed
            hover:shadow-[0_4px_16px_rgba(16,185,129,0.6)] transition-all duration-200">
          Confirm
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className={`relative w-full ${className}`}>
      <input type="hidden" id={id} name={name} value={value} required={required} />

      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        className="
          w-full flex items-center gap-2 px-3 py-2 rounded-lg
          bg-[#0f1117] border border-white/10 text-sm text-left
          hover:border-emerald-500/50 hover:bg-[#131620]
          focus:outline-none focus:border-emerald-500
          transition-all duration-200
          shadow-[0_2px_8px_rgba(0,0,0,0.4)]
        "
      >
        <CalendarDays className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className={displayValue ? 'text-white' : 'text-zinc-500'}>
          {displayValue || placeholder}
        </span>
        {value && (
          <button type="button" onClick={e => { e.stopPropagation(); clear(); }}
            className="ml-auto text-zinc-500 hover:text-white transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </button>

      {panel}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';

function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYMD(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d) {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

const QUICK_OPTIONS = [
  { label: 'Today', getRange: () => { const t = new Date(); return [toYMD(t), toYMD(t)]; } },
  { label: 'Yesterday', getRange: () => { const y = new Date(); y.setDate(y.getDate() - 1); return [toYMD(y), toYMD(y)]; } },
  { label: 'Last 7 days', getRange: () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 6); return [toYMD(start), toYMD(end)]; } },
  { label: 'Last 30 days', getRange: () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 29); return [toYMD(start), toYMD(end)]; } },
  { label: 'This month', getRange: () => { const t = new Date(); const first = new Date(t.getFullYear(), t.getMonth(), 1); const last = new Date(t.getFullYear(), t.getMonth() + 1, 0); return [toYMD(first), toYMD(last)]; } },
  { label: 'Last month', getRange: () => { const t = new Date(); const first = new Date(t.getFullYear(), t.getMonth() - 1, 1); const last = new Date(t.getFullYear(), t.getMonth(), 0); return [toYMD(first), toYMD(last)]; } },
  { label: 'Last 60 days', getRange: () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 59); return [toYMD(start), toYMD(end)]; } },
  { label: 'All dates', getRange: () => ['', ''] }
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function MiniCalendar({ monthDate, selectedFrom, selectedTo, onSelect, onPrevMonth, onNextMonth }) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();

  const cells = [];
  for (let i = 0; i < startPad; i++) {
    const prevMonth = new Date(year, month, 1 - (startPad - i));
    cells.push({ date: prevMonth, currentMonth: false, key: `pad-${i}` });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ date, currentMonth: true, key: `d-${d}` });
  }
  let rest = cells.length % 7;
  if (rest) {
    for (let i = 0; i < 7 - rest; i++) {
      const nextMonth = new Date(year, month + 1, i + 1);
      cells.push({ date: nextMonth, currentMonth: false, key: `pad2-${i}` });
    }
  }

  // Compare as YYYY-MM-DD strings to avoid timezone bugs (parseYMD + getTime can mismatch local calendar dates)
  const isStart = (d) => selectedFrom && toYMD(d) === selectedFrom;
  const isEnd = (d) => selectedTo && toYMD(d) === selectedTo;
  const isInRange = (d) => {
    const ymd = toYMD(d);
    if (selectedFrom && selectedTo) return ymd >= selectedFrom && ymd <= selectedTo;
    if (selectedFrom) return ymd === selectedFrom;
    return false;
  };
  const isSelected = (d) => isStart(d) || isEnd(d);

  return (
    <div className="min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-0.5">
          {onPrevMonth && (
            <button type="button" onClick={onPrevMonth} className="p-1 text-gray-500 hover:text-gray-800 rounded" aria-label="Previous month">
              <i className="fas fa-chevron-left text-[10px]" />
            </button>
          )}
          <span className="font-semibold text-gray-800 text-xs uppercase">{MONTHS[month]}</span>
          {onNextMonth && (
            <button type="button" onClick={onNextMonth} className="p-1 text-gray-500 hover:text-gray-800 rounded" aria-label="Next month">
              <i className="fas fa-chevron-right text-[10px]" />
            </button>
          )}
        </div>
        <span className="text-gray-600 text-xs">{year}</span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
        {DOW.map((d) => (
          <div key={d} className="py-1 text-gray-500 font-medium">
            {d}
          </div>
        ))}
        {cells.map(({ date, currentMonth, key }) => {
          const inRange = currentMonth && isInRange(date);
          const start = currentMonth && isStart(date);
          const end = currentMonth && isEnd(date);
          const selected = start || end;
          return (
            <button
              key={key}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (currentMonth) onSelect(date);
              }}
              className={`
                py-1.5 rounded text-[11px] leading-tight cursor-pointer min-w-[24px]
                ${!currentMonth ? 'text-gray-300 cursor-default' : 'text-gray-800 hover:bg-brand-mint/15'}
                ${inRange && !selected ? 'bg-brand-mint/25' : ''}
                ${selected ? 'bg-brand-navy text-white hover:bg-brand-navy-light' : ''}
              `}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DateRangePicker({ valueFrom, valueTo, onChange, placeholder = 'Select date range', className = '', buttonClassName = '' }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(valueFrom || '');
  const [to, setTo] = useState(valueTo || '');
  const [leftMonth, setLeftMonth] = useState(() => {
    const d = valueFrom ? parseYMD(valueFrom) : new Date();
    return d || new Date();
  });
  const [rightMonth, setRightMonth] = useState(() => {
    const d = valueTo ? parseYMD(valueTo) : null;
    if (d) return new Date(d.getFullYear(), d.getMonth(), 1);
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth() + 1, 1);
  });
  const ref = useRef(null);

  useEffect(() => {
    setFrom(valueFrom || '');
    setTo(valueTo || '');
    if (valueFrom) setLeftMonth(parseYMD(valueFrom) || new Date());
    if (valueTo) setRightMonth(new Date(parseYMD(valueTo).getFullYear(), parseYMD(valueTo).getMonth(), 1));
  }, [valueFrom, valueTo, open]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside, true);
    return () => document.removeEventListener('mousedown', onOutside, true);
  }, [open]);

  const apply = () => {
    const f = from || to || '';
    const t = to || from || '';
    onChange(f, t);
    setOpen(false);
  };

  const handleQuick = (getRange) => {
    const [f, t] = getRange();
    setFrom(f);
    setTo(t);
    const fd = parseYMD(f);
    if (fd) setLeftMonth(fd);
    const td = parseYMD(t);
    if (td) setRightMonth(new Date(td.getFullYear(), td.getMonth(), 1));
  };

  const handleCalendarSelect = (d) => {
    const ymd = toYMD(d);
    const singleDateSoFar = from && (!to || from === to);
    if (!from && !to) {
      setFrom(ymd);
      setTo(ymd);
      return;
    }
    if (singleDateSoFar) {
      // First date already chosen; this click sets the other end of the range
      if (ymd < from) {
        setTo(from);
        setFrom(ymd);
      } else {
        setTo(ymd);
      }
      return;
    }
    // Two different dates already selected; start a new range with this click
    setFrom(ymd);
    setTo(ymd);
  };

  const displayLabel = valueFrom && valueTo ? `${valueFrom} – ${valueTo}` : valueFrom || valueTo || placeholder;

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center px-3 py-1.5 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-brand-teal/60 min-h-[28px] ${buttonClassName}`}
      >
        <i className="fas fa-calendar-alt text-gray-500 mr-2" />
        {displayLabel}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 flex flex-col"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex gap-4">
            <div className="border-r border-gray-200 pr-3 flex flex-col gap-0.5">
              {QUICK_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => handleQuick(opt.getRange)}
                  className="text-left text-brand-teal hover:underline text-xs py-0.5"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              <MiniCalendar
                monthDate={leftMonth}
                selectedFrom={from}
                selectedTo={to}
                onSelect={handleCalendarSelect}
                onPrevMonth={() => setLeftMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                onNextMonth={() => setLeftMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              />
              <MiniCalendar
                monthDate={rightMonth}
                selectedFrom={from}
                selectedTo={to}
                onSelect={handleCalendarSelect}
                onPrevMonth={() => setRightMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                onNextMonth={() => setRightMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end border-t border-gray-200 pt-3 mt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              className="px-3 py-1.5 text-xs rounded bg-brand-navy text-white hover:bg-brand-navy-light"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

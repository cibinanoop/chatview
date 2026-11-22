import { state } from '../core/state.js';

const $ = selector => document.querySelector(selector);

let initialized = false;

function setExpanded(expanded) {
  const button = $('#toggleAdvancedInsights');
  const panel = $('#advancedInsights');
  if (!button || !panel) return;
  panel.hidden = !expanded;
  button.setAttribute('aria-expanded', String(expanded));
  button.textContent = expanded ? 'Close Chat Intelligence' : 'Explore Chat Intelligence';
  if (expanded) renderIntelligenceTools();
}

function dateInput(label, value) {
  const wrap = document.createElement('label'); wrap.className = 'intelligence-date-field'; wrap.textContent = label;
  const input = document.createElement('input'); input.type = 'date'; input.value = value; wrap.append(input);
  return { wrap, input };
}

function responseSummary() {
  const messages = state.messages.filter(message => !message.isSystem && message.sender && Number.isFinite(message.timestamp)).slice().sort((a, b) => a.timestamp - b.timestamp);
  const intervals = [];
  let previous = null;
  for (const message of messages) {
    if (previous && previous.sender !== message.sender) {
      const hours = (message.timestamp - previous.timestamp) / 3600000;
      if (hours >= 0 && hours <= 48) intervals.push(hours);
    }
    previous = message;
  }
  if (!intervals.length) return { median: null, samples: 0 };
  intervals.sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  const median = intervals.length % 2 ? intervals[middle] : (intervals[middle - 1] + intervals[middle]) / 2;
  return { median, samples: intervals.length };
}

function rangeStats(from, to) {
  const selected = state.messages.filter(message => message.date && message.date >= from && message.date <= to);
  return { count: selected.length, days: new Set(selected.map(message => message.date)).size, average: selected.length / Math.max(1, new Set(selected.map(message => message.date)).size) };
}

function renderIntelligenceTools() {
  const root = $('#advancedInsights');
  if (!root || !state.stats) return;
  root.querySelector('#intelligence-tools')?.remove();
  const dates = state.messages.map(message => message.date).filter(Boolean).sort();
  if (!dates.length) return;
  const first = dates[0], last = dates.at(-1);
  const middle = new Date((new Date(`${first}T12:00:00`).getTime() + new Date(`${last}T12:00:00`).getTime()) / 2).toISOString().slice(0, 10);
  const section = document.createElement('section'); section.id = 'intelligence-tools'; section.className = 'advanced-chart-section intelligence-tools';
  const title = document.createElement('h4'); title.textContent = 'Explore this conversation'; section.append(title);
  const compareTitle = document.createElement('strong'); compareTitle.className = 'intelligence-subtitle'; compareTitle.textContent = 'Compare two date ranges'; section.append(compareTitle);
  const rangeGrid = document.createElement('div'); rangeGrid.className = 'intelligence-range-grid';
  const fields = [dateInput('Range A · from', first), dateInput('Range A · to', middle), dateInput('Range B · from', middle < last ? new Date(new Date(`${middle}T12:00:00`).getTime() + 86400000).toISOString().slice(0, 10) : last), dateInput('Range B · to', last)];
  fields.forEach(field => rangeGrid.append(field.wrap)); section.append(rangeGrid);
  const compare = document.createElement('button'); compare.type = 'button'; compare.className = 'intelligence-action'; compare.textContent = 'Compare activity';
  const comparison = document.createElement('p'); comparison.className = 'intelligence-result'; comparison.setAttribute('aria-live', 'polite');
  compare.addEventListener('click', () => {
    const a = rangeStats(fields[0].input.value, fields[1].input.value), b = rangeStats(fields[2].input.value, fields[3].input.value);
    const change = a.average ? ((b.average - a.average) / a.average) * 100 : null;
    comparison.textContent = `Range A: ${a.count.toLocaleString()} messages over ${a.days} active days (${a.average.toFixed(1)} per active day). Range B: ${b.count.toLocaleString()} messages over ${b.days} active days (${b.average.toFixed(1)} per active day). ${change === null ? 'Range A has no active-day baseline for a percentage comparison.' : `Activity changed ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)}% per active day.`}`;
  });
  section.append(compare, comparison);
  const replies = responseSummary();
  const reply = document.createElement('p'); reply.className = 'intelligence-result';
  reply.textContent = replies.median === null ? 'Reply timing: there are not enough alternating participant messages to calculate a summary.' : `Typical reply gap (median): ${replies.median < 1 ? `${Math.round(replies.median * 60)} minutes` : `${replies.median.toFixed(1)} hours`} across ${replies.samples.toLocaleString()} participant switches within 48 hours. This is an archive-based timing summary, not a judgement about participants.`;
  section.append(reply);
  const report = document.createElement('button'); report.type = 'button'; report.className = 'intelligence-action'; report.textContent = 'Download insights report';
  report.addEventListener('click', () => {
    const stats = state.stats;
    const lines = ['ChatView local conversation insights', `Messages: ${stats.total}`, `Participants: ${stats.participants.map(person => `${person.name} (${person.count})`).join(', ')}`, `Date range: ${new Date(stats.first).toLocaleDateString()} – ${new Date(stats.last).toLocaleDateString()}`, `Active days: ${stats.activeDays}`, `Media: ${Object.entries(stats.typeCounts).map(([kind, count]) => `${kind} ${count}`).join(', ')}`, `Busiest day: ${stats.busiestDay ? `${stats.busiestDay.date} (${stats.busiestDay.count})` : 'n/a'}`, `Busiest month: ${stats.busiestMonth ? `${stats.busiestMonth.month} (${stats.busiestMonth.count})` : 'n/a'}`, `Peak hour: ${String(stats.peakHour).padStart(2, '0')}:00`, `Median reply gap: ${replies.median === null ? 'not available' : `${replies.median.toFixed(2)} hours (${replies.samples} samples)`}`, '', 'Descriptive statistics calculated locally from this archive. They are not psychological conclusions.'];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'ChatView-Insights.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  section.append(report); root.append(section);
}

export function setupIntelligencePanel() {
  if (initialized) return;
  const button = $('#toggleAdvancedInsights');
  if (!button) return;
  initialized = true;
  button.setAttribute('aria-controls', 'advancedInsights');
  button.addEventListener('click', () => setExpanded(button.getAttribute('aria-expanded') !== 'true'));
  window.addEventListener('chatview:reset', () => setExpanded(false));
  window.addEventListener('chatview:import-start', () => setExpanded(false));
}

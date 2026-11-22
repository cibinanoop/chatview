let records = [];
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'index') {
    records = data.messages.map((message, index) => ({
      id: message.id, index, sender: message.sender || '', content: message.content || '',
      attachments: (message.attachments || []).map(item => ({ kind: item.kind, name: item.name || '', missing: Boolean(item.missing) })),
      hasLink: Boolean(message.hasLink), system: Boolean(message.isSystem), date: message.date || '', type: message.type || 'text'
    }));
    self.postMessage({ type: 'indexed', count: records.length });
    return;
  }
  if (data.type !== 'search') return;
  try {
    const q = (data.query || '').trim().toLocaleLowerCase();
    const { filter = 'all', from = '', to = '', participant = '' } = data;
    const matches = [];
    for (const item of records) {
      if (filter === 'system' && !item.system) continue;
      if (filter === 'link' && !item.hasLink) continue;
      if (['image','video','audio','document'].includes(filter) && !item.attachments.some(a => filter === 'document' ? ['document','file'].includes(a.kind) : a.kind === filter)) continue;
      if ((from || to) && !item.date) continue;
      if (from && item.date && item.date < from) continue;
      if (to && item.date && item.date > to) continue;
      if (participant && item.sender !== participant) continue;
      if (q && !`${item.content}\n${item.sender}\n${item.attachments.map(a => a.name).join('\n')}`.toLocaleLowerCase().includes(q)) continue;
      matches.push(item.index);
    }
    self.postMessage({ type: 'results', id: data.id, indices: matches });
  } catch (error) { self.postMessage({ type: 'error', id: data.id, message: error.message || 'Search failed.' }); }
});

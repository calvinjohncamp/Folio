const pendingKey = 'folio-project-changes-v1';

export function connectProjectLibrary(remote, request, token) {
  let pending;
  try { pending = JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch {}
  pending ||= { changes: [], projects: [] };
  let seen = new Map();
  let knownProjects = new Set();
  let batch = null;
  let retry;

  function persist() {
    try {
      localStorage.setItem(pendingKey, JSON.stringify({
        changes: [...(batch?.changes || []), ...pending.changes],
        projects: [...new Set([...(batch?.projects || []), ...pending.projects])],
      }));
    } catch {}
  }
  function flush() {
    clearTimeout(retry);
    if (batch || (!pending.changes.length && !pending.projects.length)) return;
    batch = pending;
    pending = { changes: [], projects: [] };
    persist();
    request('project-library', batch, token).then(() => {
      batch = null;
      persist();
      flush();
    }).catch(() => {
      pending.changes.unshift(...batch.changes);
      pending.projects.unshift(...batch.projects);
      batch = null;
      persist();
      retry = setTimeout(flush, 8000);
    });
  }
  function stage(delta) {
    pending.changes.push(...delta.changes);
    pending.projects.push(...delta.projects);
    persist();
  }
  const change = (record, previous) => ({
    id: (record || previous).id,
    before: previous || null,
    after: record ? structuredClone(record) : null,
    operation: crypto.randomUUID(),
  });
  return {
    templates: remote.templates || {},
    saveTemplate(entry) {
      return request('project-template', entry, token);
    },
    initialize(local) {
      const records = new Map(remote.registers.map(record => [record.id, record]));
      const removed = new Set(remote.removed);
      for (const patch of pending.changes) {
        if (patch.after) records.set(patch.id, patch.after);
        else records.delete(patch.id);
      }
      const changes = [];
      // Import browser-only entries created before Supabase storage was introduced.
      for (const record of local?.registers || []) {
        if (records.has(record.id) || removed.has(record.id) ||
            pending.changes.some(patch => patch.id === record.id)) continue;
        records.set(record.id, record);
        changes.push(change(record, null));
      }
      const projects = [...new Set([...remote.projects, ...pending.projects, ...(local?.projects || [])])];
      if (changes.length || projects.some(project => !remote.projects.includes(project))) {
        stage({ changes, projects: projects.filter(project => !remote.projects.includes(project)) });
      }
      seen = new Map([...records].map(([id, record]) => [id, JSON.stringify(record)]));
      knownProjects = new Set(projects);
      queueMicrotask(flush);
      return { registers: [...records.values()], projects };
    },
    save(library) {
      const next = new Map(library.registers.map(record => [record.id, JSON.stringify(record)]));
      const changes = library.registers.filter(record => next.get(record.id) !== seen.get(record.id))
        .map(record => change(record, seen.has(record.id) ? JSON.parse(seen.get(record.id)) : null));
      for (const [id, record] of seen) if (!next.has(id)) changes.push(change(null, JSON.parse(record)));
      const projects = library.projects.filter(project => !knownProjects.has(project));
      if (!changes.length && !projects.length) return;
      seen = next;
      knownProjects = new Set(library.projects);
      stage({ changes, projects });
      flush();
    },
  };
}

// Runs real routes/controllers against an isolated database boundary.
function createFakeSupabase() {
  const tables = { resumes: [], resume_versions: [], resume_templates: [], profiles: [], writing_tips: [], import_jobs: [] };
  const failures = {};
  const clone = value => JSON.parse(JSON.stringify(value));
  const client = {
    tables, failures,
    auth: { getUser: async token => ({
      data: { user: ['owner', 'other'].includes(token)
        ? { id: token, email: `${token}@example.invalid`, user_metadata: { name: token } } : null }, error: null,
    }) },
    from(table) {
      const filters = [], sorts = [];
      let action = 'select', payload, max, shape = 'many', selection = '*', countOnly = false;
      const query = {
        select(fields = '*', options = {}) { selection = fields; countOnly = options.head; return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        or(expression) {
          const tests = expression.split(',').map(part => {
            const [key, , raw] = part.split('.'); return row => String(row[key]) === raw;
          });
          filters.push(row => tests.some(test => test(row))); return query;
        },
        order(key, options = {}) { sorts.push([key, options.ascending !== false]); return query; },
        limit(value) { max = value; return query; },
        maybeSingle() { shape = 'one'; return query; },
        single() { shape = 'one'; return query; },
        insert(value) { action = 'insert'; payload = value; return query; },
        update(value) { action = 'update'; payload = value; return query; },
        delete() { action = 'delete'; return query; },
        then(resolve, reject) {
          try {
            const failure = failures[`${table}.${action}`];
            if (failure) return Promise.resolve({ data: null, error: failure }).then(resolve, reject);
            let rows = tables[table].filter(row => filters.every(test => test(row)));
            if (action === 'insert') {
              const values = Array.isArray(payload) ? payload : [payload];
              if (values.some(row => tables[table].some(existing => row.id && existing.id === row.id))) {
                return Promise.resolve({ data: null, error: { code: '23505', message: 'Duplicate id' } }).then(resolve, reject);
              }
              rows = values.map(row => clone({ created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row }));
              tables[table].push(...rows);
            } else if (action === 'update') rows.forEach(row => Object.assign(row, clone(payload)));
            else if (action === 'delete') tables[table] = tables[table].filter(row => !rows.includes(row));
            rows = [...rows];
            for (const [key, asc] of sorts.reverse()) rows.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (asc ? 1 : -1));
            if (max !== undefined) rows = rows.slice(0, max);
            if (selection !== '*') rows = rows.map(row => Object.fromEntries(selection.split(',').map(key => [key.trim(), row[key.trim()]])));
            const data = countOnly ? null : shape === 'one' ? rows[0] || null : rows;
            return Promise.resolve({ data: clone(data), count: rows.length, error: null }).then(resolve, reject);
          } catch (err) { return Promise.reject(err).then(resolve, reject); }
        },
      };
      return query;
    },
  };
  return client;
}
module.exports = { createFakeSupabase };

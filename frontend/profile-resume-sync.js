/* Shared, account-scoped autofill. Existing answers always win. No cross-user cache. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ProfileResumeSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const text = value => typeof value === 'string' ? value.trim() : '';
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const list = value => Array.isArray(value) ? value : [];
  const normal = value => text(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  function skills(values) {
    const seen = new Set();
    return values.map(v => text(typeof v === 'string' ? v : v?.name)).filter(v => {
      const key = normal(v);
      if (!key || /^(idontknowyet|idontknow|notsure)$/.test(key) || seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  function fill(target, key, value) { if (!text(target[key]) && text(value)) target[key] = text(value); }
  function profileToResume(content, profile) {
    const result = JSON.parse(JSON.stringify(object(content)));
    profile = object(profile);
    result.contact = object(result.contact);
    fill(result.contact, 'name', profile.name);
    fill(result.contact, 'email', profile.email);
    fill(result.contact, 'phone', profile.whatsapp);
    // A preferred work location is not the person's current address.
    if (profile.career_stage === 'experienced') fill(result.contact, 'title', profile.recent_role);
    const degree = [text(profile.qualification), text(profile.specialisation)].filter(Boolean).join(' · ') || text(profile.degree);
    const school = text(profile.institution);
    if (degree || school) {
      const rows = list(result.education);
      // Only fill an empty list/placeholder or a clearly matching education entry.
      // Do not append a guessed duplicate when the person already customised education.
      let row = rows.find(e => normal(e?.institution) && normal(e.institution) === normal(school) && (!text(e.degree) || normal(e.degree) === normal(degree)))
        || rows.find(e => !text(e?.institution) && !text(e?.degree) && !text(e?.endDate));
      if (!rows.length) { row = {}; rows.push(row); }
      if (row) {
        fill(row, 'institution', school); fill(row, 'degree', degree);
        fill(row, 'endDate', /^\d{4}$/.test(text(profile.grad_year)) ? profile.grad_year : '');
      }
      result.education = rows;
    }
    if (!list(result.skills).length) {
      const preferences = object(profile.career_preferences);
      result.skills = skills([...text(profile.skills).split(','), ...list(preferences.skills), ...list(preferences.softSkills)]);
    }
    return result;
  }
  function resumeToProfile(profile, content, courses = []) {
    const result = {...object(profile)};
    content = object(content);
    const contact = object(content.contact);
    fill(result, 'name', text(contact.name).slice(0,120));
    fill(result, 'email', text(contact.email).slice(0,320));
    fill(result, 'whatsapp', text(contact.phone).slice(0,20));
    const rows = list(content.education).filter(e => e && (text(e.degree) || text(e.institution)));
    // Prefer the entry matching an existing institution/qualification; otherwise
    // use the first entry as ordered by the resume owner, without ranking degrees.
    const education = rows.find(e => normal(e.institution) === normal(result.institution) && normal(result.institution)) || rows[0];
    if (education) {
      const degree = text(education.degree);
      const course = list(courses).map(c => c[0]).sort((a,b) => b.length-a.length).find(name => {
        const prefix = degree.slice(0,name.length);
        return normal(prefix) === normal(name) && (!degree[name.length] || /[\s·,(/-]/.test(degree[name.length]));
      });
      const qualification = course || degree;
      const compatible = (!text(result.institution) || normal(result.institution) === normal(education.institution))
        && (!text(result.qualification) || normal(result.qualification) === normal(qualification));
      if (compatible) {
        fill(result, 'institution', text(education.institution).slice(0,200));
        fill(result, 'qualification', qualification.slice(0,120));
        if (course) fill(result, 'specialisation', degree.slice(course.length).replace(/^[\s·,(/-]+|[)\s]+$/g,'').replace(/^(?:in|of)\s+/i,'').slice(0,120));
        const years = text(education.endDate).match(/\b(?:19|20)\d{2}\b/g);
        if (years) fill(result, 'grad_year', years[years.length-1]);
      }
    }
    if (!text(result.skills)) result.skills = skills(list(content.skills)).join(', ').slice(0,2000);
    // A resume headline can describe a target job; never infer employment from it.
    return result;
  }
  async function sessionUser(client, expectedId) {
    if (!client || !expectedId) return null;
    const {data, error} = await client.auth.getSession();
    return !error && data?.session?.user?.id === expectedId ? data.session.user : null;
  }
  async function readProfile(client, userId) {
    if (!await sessionUser(client,userId)) return null;
    const {data,error} = await client.from('candidate_profiles').select('*').eq('user_id',userId).maybeSingle();
    if (error) throw new Error('Could not load profile details for autofill.');
    return data;
  }
  async function readLatestResume(client, userId) {
    if (!await sessionUser(client,userId)) return null;
    const {data,error} = await client.from('resumes').select('content').eq('user_id',userId).order('updated_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle();
    if (error) throw new Error('Could not load resume details for autofill.');
    return data ? object(data.content) : null;
  }
  return {profileToResume, resumeToProfile, readProfile, readLatestResume};
});

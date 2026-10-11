import { useEffect, useMemo, useRef, useState } from 'react';
import { studentApi } from './api/students';
import { emptyStudent, validateStudent, validateStudentUpdate } from './validation/student';
import StudentForm from './components/StudentForm';
import TeamBoard from './components/TeamBoard';
import { usePath } from './hooks/usePath';

const palettes = ['coral', 'violet', 'blue', 'mint', 'amber'];
const shuffle = (items) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};
function makeTeams(students, size, mode, previous, locked) {
  const count = Math.ceil(students.length / size);
  const teams = Array.from({ length: count }, () => []);
  const byId = new Map(students.map((student) => [student.id, student]));
  const fixed = teams.map(() => []);
  const assigned = new Set();
  const priorLocked = previous ? previous.flatMap((team, index) => team.filter((id) => locked.has(id) && byId.has(id)).map((id) => ({ id, index }))) : [];
  priorLocked.forEach(({ id, index }) => { if (index < count && fixed[index].length < size) { fixed[index].push(id); assigned.add(id); } });
  fixed.forEach((team, index) => { teams[index] = [...team]; });
  let incoming = students.filter((student) => !assigned.has(student.id));
  incoming = mode === 'Random' ? shuffle(incoming) : shuffle(incoming).sort((a, b) => a.major.localeCompare(b.major));
  for (const student of incoming) {
    const available = teams.map((team, index) => ({ team, index })).filter(({ team }) => team.length < size);
    const minSize = Math.min(...available.map(({ team }) => team.length));
    const balanced = available.filter(({ team }) => team.length === minSize);
    const candidates = mode === 'Mix majors' ? balanced.map((entry) => ({ ...entry, matching: entry.team.filter((id) => byId.get(id)?.major === student.major).length })) : balanced;
    const fewest = Math.min(...candidates.map((entry) => entry.matching || 0));
    const chosen = shuffle(candidates.filter((entry) => (entry.matching || 0) === fewest))[0];
    teams[chosen.index].push(student.id);
  }
  return teams;
}

export default function App() {
  const [path, navigate] = usePath();
  const view = path === '/' ? 'landing' : 'workspace';
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('cohort-theme') === 'dark');
  const tab = path === '/team' ? 'teams' : 'students';
  const [studentMap, setStudentMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [apiError, setApiError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [major, setMajor] = useState('');
  const [sort, setSort] = useState({ key: 'name', direction: 1 });
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [teamMajor, setTeamMajor] = useState('');
  const [eligible, setEligible] = useState(new Set());
  const [teamSize, setTeamSize] = useState(4);
  const [mode, setMode] = useState('Random');
  const [teams, setTeams] = useState(null);
  const [locked, setLocked] = useState(new Set());
  const [outdated, setOutdated] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [shuffleNames, setShuffleNames] = useState({});
  const [swapping, setSwapping] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const rowRefs = useRef(new Map());
  const dialogRef = useRef(null);
  const teamTimer = useRef(null);
  const nameTimer = useRef(null);
  const reducedMotion = useRef(false);
  const students = useMemo(() => Object.values(studentMap), [studentMap]);
  const majors = useMemo(() => [...new Set(students.map((student) => student.major))].sort(), [students]);
  const eligibleStudents = useMemo(() => students.filter((student) => eligible.has(student.id)), [students, eligible]);
  const visibleStudents = useMemo(() => students.filter((student) =>
    (!major || student.major === major) && ['id', 'name', 'email'].some((key) => student[key].toLowerCase().includes(query.trim().toLowerCase()))
  ).sort((a, b) => a[sort.key].localeCompare(b[sort.key]) * sort.direction), [students, major, query, sort]);

  useEffect(() => { reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem('cohort-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);
  useEffect(() => () => { window.clearTimeout(teamTimer.current); window.clearInterval(nameTimer.current); }, []);
  useEffect(() => {
    const handle = (event) => { if (event.key === 'Escape' && swapping) setSwapping(null); };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  }, [swapping]);
  useEffect(() => { if (form && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal(); }, [form]);
  useEffect(() => {
    if (!highlightId) return;
    rowRefs.current.get(highlightId)?.scrollIntoView({ behavior: reducedMotion.current ? 'auto' : 'smooth', block: 'center' });
    const timeout = window.setTimeout(() => setHighlightId(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [highlightId, students, path]);

  const load = async () => {
    setLoading(true); setApiError('');
    try {
      const records = await studentApi.list();
      setStudentMap(Object.fromEntries(records.map((student) => [student.id, student])));
      setEligible(new Set(records.map((student) => student.id)));
      setLoaded(true);
    } catch (error) { setApiError(error.message); }
    finally { setLoading(false); }
  };
  const enterWorkspace = () => { navigate('/students'); if (!loaded && !loading) load(); };
  useEffect(() => { if (view === 'workspace' && !loaded && !loading) load(); }, [view, loaded, loading]);

  useEffect(() => {
    if (!teams) return;
    setTeams((current) => current?.map((team) => team.filter((id) => Boolean(studentMap[id]))) || null);
    setLocked((current) => new Set([...current].filter((id) => Boolean(studentMap[id]))));
    setEligible((current) => new Set([...current].filter((id) => Boolean(studentMap[id]))));
  }, [studentMap]);

  const startForm = (student = null) => { setForm(student ? { ...student, _originalId: student.id } : emptyStudent()); setErrors({}); setApiError(''); setNotice(''); };
  const closeForm = () => { if (dialogRef.current?.open) dialogRef.current.close(); setForm(null); setErrors({}); };
  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setApiError('');
  };
  const save = async (event) => {
    event.preventDefault();
    const originalId = form._originalId;
    const { student, fields } = originalId
      ? validateStudentUpdate(form, students, originalId)
      : validateStudent(form, students);
    setErrors(fields); if (Object.keys(fields).length) return;
    setSaving(true); setApiError('');
    try {
      const saved = originalId ? await studentApi.update(originalId, { name: student.name, email: student.email, dob: student.dob, major: student.major }) : await studentApi.create(student);
      setStudentMap((current) => ({ ...current, [saved.id]: saved }));
      if (!originalId) { setEligible((current) => new Set(current).add(saved.id)); setQuery(''); setMajor(''); setSort({ key: 'name', direction: 1 }); navigate('/students'); setHighlightId(saved.id); }
      else if (studentMap[originalId]?.major !== saved.major && teams?.some((team) => team.includes(originalId))) setOutdated(true);
      closeForm(); setNotice(originalId ? 'Student updated.' : 'Student added.');
    } catch (error) { setErrors(error.fields || {}); setApiError(error.message); }
    finally { setSaving(false); }
  };
  const remove = async (student) => {
    if (!window.confirm(`Delete ${student.name} (${student.id})? This also removes them from team assignments.`)) return;
    setPendingIds((ids) => new Set(ids).add(student.id)); setApiError('');
    try {
      await studentApi.remove(student.id);
      setStudentMap((current) => { const next = { ...current }; delete next[student.id]; return next; });
      setNotice(`${student.name} was deleted.`);
    } catch (error) { setApiError(error.message); }
    finally { setPendingIds((ids) => { const next = new Set(ids); next.delete(student.id); return next; }); }
  };
  const toggleSort = (key) => setSort((current) => current.key === key ? { key, direction: -current.direction } : { key, direction: 1 });
  const toggleEligible = (id) => { setEligible((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); setOutdated(true); };
  const selectedValid = eligibleStudents.length > 0 && Number.isInteger(teamSize) && teamSize >= 2 && teamSize <= 12;
  const regenerate = () => {
    if (!selectedValid || animating) return;
    const next = makeTeams(eligibleStudents, teamSize, mode, teams, locked);
    setAnimating(true); setOutdated(false); setSwapping(null);
    if (teams && !reducedMotion.current) {
      let tick = 0;
      const pool = shuffle(eligibleStudents);
      nameTimer.current = window.setInterval(() => {
        tick += 1;
        setShuffleNames(Object.fromEntries(pool.map((student, index) => [student.id, pool[(index + tick) % pool.length]?.name || student.name])));
      }, 72);
    }
    if (reducedMotion.current) { setTeams(next); setLocked(new Set()); setAnimating(false); return; }
    teamTimer.current = window.setTimeout(() => { window.clearInterval(nameTimer.current); setShuffleNames({}); setTeams(next); setLocked(new Set()); setAnimating(false); }, Math.min(1250, 620 + eligibleStudents.length * 38));
  };
  const resetTeams = () => { if (!animating) { setTeams(null); setLocked(new Set()); setOutdated(false); setSwapping(null); } };
  const toggleLock = (id) => setLocked((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const swapWith = (id) => {
    if (!swapping) { setSwapping(id); return; }
    if (swapping === id) { setSwapping(null); return; }
    if (locked.has(swapping) || locked.has(id)) { setSwapping(null); return; }
    const next = teams.map((team) => [...team]);
    const a = next.findIndex((team) => team.includes(swapping)); const b = next.findIndex((team) => team.includes(id));
    if (a >= 0 && b >= 0 && a !== b) { next[a][next[a].indexOf(swapping)] = id; next[b][next[b].indexOf(id)] = swapping; setTeams(next); }
    setSwapping(null);
  };
  const moveStudent = (id, targetTeam, targetId) => {
    if (animating || locked.has(id) || !teams) return;
    const sourceTeam = teams.findIndex((team) => team.includes(id));
    if (sourceTeam < 0 || sourceTeam === targetTeam || targetTeam < 0 || targetTeam >= teams.length) return;
    const next = teams.map((team) => [...team]);
    const sourceIndex = next[sourceTeam].indexOf(id);
    const [moving] = next[sourceTeam].splice(sourceIndex, 1);
    const targetIndex = targetId ? next[targetTeam].indexOf(targetId) : -1;
    const occupant = targetIndex >= 0 ? next[targetTeam][targetIndex] : next[targetTeam][sourceIndex] || next[targetTeam][next[targetTeam].length - 1];
    if (occupant && !locked.has(occupant)) {
      const targetIndex = next[targetTeam].indexOf(occupant);
      next[targetTeam][targetIndex] = moving;
      next[sourceTeam].splice(Math.min(sourceIndex, next[sourceTeam].length), 0, occupant);
    } else next[targetTeam].push(moving);
    setTeams(next);
    setOutdated(false);
  };

  const themeButton = <button className="theme-toggle" onClick={() => setDarkMode((value) => !value)} aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`} title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}><span>{darkMode ? '☼' : '☾'}</span><small>{darkMode ? 'Light' : 'Dark'}</small></button>;
  if (view === 'landing') return <main className="landing">
    <header className="landing-nav"><a className="brand" href="#top" onClick={(event) => event.preventDefault()}><span className="brand-mark">◎</span> cohort<span className="brand-dot">.</span></a><span className="nav-caption">STUDENT WORKSPACE</span>{themeButton}<button className="button button-dark" onClick={enterWorkspace}>Open workspace <span>↗</span></button></header>
    <section className="hero" id="top"><div className="hero-copy"><span className="eyebrow"><span className="live-dot"/> A CLEARER WAY TO BUILD YOUR COHORT</span><h1>Good teams<br/>start with <em>knowing<br/>your people.</em></h1><p>Keep student records tidy, then bring the right mix of people together. One calm workspace for the whole class.</p><button className="button button-dark button-large" onClick={enterWorkspace}>Open your workspace <span>→</span></button><div className="hero-proof"><div className="avatar-stack"><i>JM</i><i>AK</i><i>LT</i><i>+12</i></div><span>Thoughtful teams, made simple</span></div></div>
      <div className="hero-art" aria-label="Illustration of student cards assembling into teams"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-center"><span>✳</span><small>BETTER<br/>TOGETHER</small></div><div className="float-card card-one"><span className="mini-avatar coral-bg">MC</span><b>Maya Chen</b><small>Computer Science</small></div><div className="float-card card-two"><span className="mini-avatar violet-bg">JL</span><b>Jordan Lee</b><small>Design Systems</small></div><div className="float-card card-three"><span className="mini-avatar yellow-bg">AS</span><b>Alex Smith</b><small>Data Science</small></div><div className="team-chip chip-one"><i/> TEAM 01 <span>4</span></div><div className="team-chip chip-two"><i/> TEAM 02 <span>4</span></div><div className="spark spark-one">✳</div><div className="spark spark-two">✦</div><span className="art-caption">A good mix is closer than you think.</span></div>
    </section><section className="features"><div className="feature-intro"><span className="eyebrow">ONE SPACE, THREE SIMPLE STEPS</span><h2>Less admin.<br/><em>More momentum.</em></h2></div><article className="feature-card"><span className="feature-icon icon-lilac">▤</span><span className="feature-number">01 / RECORDS</span><h3>Know your cohort</h3><p>Find and update student details quickly. Every record stays consistent and easy to search.</p></article><article className="feature-card"><span className="feature-icon icon-peach">✓</span><span className="feature-number">02 / VALIDATION</span><h3>Get it right early</h3><p>Helpful checks catch missing details and duplicates while you work.</p></article><article className="feature-card"><span className="feature-icon icon-mint">✳</span><span className="feature-number">03 / TEAMS</span><h3>Make room for mix</h3><p>Build balanced groups in a moment, with a little more variety in every room.</p></article></section><footer className="landing-footer"><a className="brand" href="#top" onClick={(event) => event.preventDefault()}><span className="brand-mark">◎</span> cohort<span className="brand-dot">.</span></a><span>Made for the people who make a class.</span><button onClick={enterWorkspace}>Go to workspace ↗</button></footer>
  </main>;

  return <main className="workspace-app"><header className="workspace-nav"><button className="brand" onClick={() => navigate('/') }><span className="brand-mark">◎</span> cohort<span className="brand-dot">.</span></button><nav aria-label="Workspace views"><button className={tab === 'students' ? 'nav-tab active' : 'nav-tab'} onClick={() => navigate('/students')}>Students</button><button className={tab === 'teams' ? 'nav-tab active' : 'nav-tab'} onClick={() => navigate('/team')}>Team builder</button></nav>{themeButton}<button className="workspace-back" onClick={() => navigate('/')}>← Home</button></header>
    <section className="workspace-content">{notice && <p className="notice success" role="status">{notice}</p>}{apiError && <p className="notice error" role="alert">{apiError} <button onClick={load}>Retry</button></p>}
      {tab === 'students' ? <><div className="workspace-title"><div><span className="eyebrow">YOUR PEOPLE, IN ONE PLACE</span><h1>Students <span className="count-pill">{students.length}</span></h1><p>Keep the details that help your cohort work better together.</p></div><button className="button button-dark" onClick={() => startForm()}>＋ Add student</button></div>
        <section className="panel student-panel"><div className="toolbar"><label className="search-box"><span>⌕</span><input aria-label="Search students by ID, name, or email" placeholder="Search ID, name, or email" value={query} onChange={(event) => setQuery(event.target.value)}/>{query && <button onClick={() => setQuery('')} aria-label="Clear search">×</button>}</label><label className="select-box"><span>Major</span><select value={major} onChange={(event) => setMajor(event.target.value)}><option value="">All majors</option>{majors.map((item) => <option key={item}>{item}</option>)}</select></label><span className="showing-count">{visibleStudents.length} showing</span></div>
          {loading ? <div className="state"><span className="loader"/> Loading student records…</div> : !students.length ? <div className="state"><span className="state-icon">◌</span><h2>Your cohort starts here</h2><p>Add your first student to get started.</p><button className="button button-dark" onClick={() => startForm()}>Add a student</button></div> : !visibleStudents.length ? <div className="state"><span className="state-icon">⌕</span><h2>No students match</h2><p>Try another search or clear the major filter.</p><button className="button button-light" onClick={() => { setQuery(''); setMajor(''); }}>Clear filters</button></div> : <div className="table-scroll"><table className="student-table"><thead><tr>{[['id','ID'],['name','STUDENT'],['email','EMAIL'],['dob','DATE OF BIRTH'],['major','MAJOR']].map(([key,label]) => <th key={key}><button onClick={() => toggleSort(key)}>{label}<span>{sort.key === key ? sort.direction === 1 ? ' ↑' : ' ↓' : ' ↕'}</span></button></th>)}<th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visibleStudents.map((student) => <tr key={student.id} ref={(node) => node ? rowRefs.current.set(student.id, node) : rowRefs.current.delete(student.id)} className={highlightId === student.id ? 'record-highlight' : ''}><td><code>{student.id}</code></td><td><span className={`table-avatar ${palettes[student.name.charCodeAt(0) % palettes.length]}`}>{student.name.split(/\s+/).map((part) => part[0]).slice(0,2).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.email}</td><td>{student.dob}</td><td><span className="major-tag">{student.major}</span></td><td className="table-actions"><button onClick={() => startForm(student)}>Edit</button><button className="delete-link" disabled={pendingIds.has(student.id)} onClick={() => remove(student)}>{pendingIds.has(student.id) ? 'Deleting…' : 'Delete'}</button></td></tr>)}</tbody></table></div>}
        </section></> : <><div className="workspace-title team-title"><div><span className="eyebrow">A LITTLE STRUCTURE, A LOT OF POSSIBILITY</span><h1>Team builder <span className="team-sparkle">✳</span></h1><p>Mix your cohort into groups that bring different perspectives together.</p></div></div>
          <div className="team-layout"><aside className="panel team-controls"><div className="panel-heading"><span className="eyebrow">SET UP YOUR GROUPS</span><span className="step-dot">01</span></div><label className="control-label">Eligible students <span>{eligibleStudents.length} of {students.length}</span></label><label className="select-box full-select"><span>Filter by major</span><select value={teamMajor} onChange={(event) => setTeamMajor(event.target.value)}><option value="">All majors</option>{majors.map((item) => <option key={item}>{item}</option>)}</select></label><div className="eligibility-list" aria-label="Choose eligible students">{students.filter((student) => !teamMajor || student.major === teamMajor).map((student) => <label key={student.id} className="eligibility-row"><input type="checkbox" checked={eligible.has(student.id)} onChange={() => toggleEligible(student.id)} disabled={animating}/><span className={`table-avatar ${palettes[student.name.charCodeAt(0) % palettes.length]}`}>{student.name.split(/\s+/).map((part) => part[0]).slice(0,2).join('').toUpperCase()}</span><span className="eligibility-name">{student.name}<small>{student.major}</small></span></label>)}</div>
              <div className="control-divider"/><label className="control-label" htmlFor="team-size">Target team size <span>2–12</span></label><div className="stepper"><button aria-label="Decrease team size" disabled={teamSize <= 2 || animating} onClick={() => { setTeamSize((n) => n - 1); setOutdated(true); }}>−</button><input id="team-size" type="number" min="2" max="12" value={teamSize} disabled={animating} onChange={(event) => { setTeamSize(Number(event.target.value)); setOutdated(true); }}/><button aria-label="Increase team size" disabled={teamSize >= 12 || animating} onClick={() => { setTeamSize((n) => n + 1); setOutdated(true); }}>＋</button></div><label className="control-label mode-label">Team style</label><div className="mode-picker"><button className={mode === 'Random' ? 'mode-option selected' : 'mode-option'} onClick={() => { setMode('Random'); if (teams) setOutdated(true); }} disabled={animating}><span>⤨</span><b>Random</b><small>Shake things up</small></button><button className={mode === 'Mix majors' ? 'mode-option selected' : 'mode-option'} onClick={() => { setMode('Mix majors'); if (teams) setOutdated(true); }} disabled={animating}><span>✳</span><b>Mix majors</b><small>Mix perspectives</small></button></div><p className="heuristic-note">Mix majors favors putting each student with people from different fields. It’s a helpful heuristic, not a perfect balance.</p><button className="button button-dark generate-button" disabled={!selectedValid || animating} onClick={regenerate}>{animating ? 'Shuffling people…' : teams ? '↻  Reshuffle teams' : '✳  Build my teams'}</button>{!selectedValid && <p className="control-hint">{eligibleStudents.length === 0 ? 'Select at least one student to continue.' : 'Choose a team size from 2 to 12.'}</p>}{teams && <button className="reset-button" disabled={animating} onClick={resetTeams}>Reset assignments</button>}</aside>
            <section className="panel team-stage"><div className="stage-heading"><div><span className="eyebrow">YOUR TEAM SPACE</span><h2>{teams ? `${teams.length} thoughtfully mixed teams` : 'A little space to get started'}</h2></div><span className="assignment-label">{teams ? 'SESSION ASSIGNMENTS' : 'READY WHEN YOU ARE'}</span></div>{outdated && teams && <div className="outdated-banner" role="status"><span>↻</span><div><b>Your setup has changed</b><small>Build teams again to reflect the latest student selection and settings. Regenerating clears all locks.</small></div><button onClick={regenerate} disabled={!selectedValid || animating}>Regenerate</button></div>}{!teams ? <div className="empty-stage"><div className="empty-orbit"><span>✳</span><i/><i/><i/></div><h3>Your next great group starts here.</h3><p>Choose who’s in, set your team size, and let a good mix happen.</p></div> : <TeamBoard teams={teams} students={students} locked={locked} swapping={swapping} animating={animating} outdated={outdated} shuffleNames={shuffleNames} onMove={moveStudent} onLock={toggleLock} onSwap={swapWith} />}{teams && <p className="stage-footnote"><span>◆</span> Locked students stay in place during reshuffles. Drag an unlocked card to another team, or use ⇄ to swap with the keyboard. {swapping ? 'Choose a student in another team to swap, or press Escape to cancel.' : ''}</p>}</section></div></>}
    </section>
    {form && <dialog className="student-dialog" ref={dialogRef} onClose={() => { setForm(null); setErrors({}); }} onCancel={(event) => { event.preventDefault(); closeForm(); }}><div className="dialog-heading"><div><span className="eyebrow">STUDENT RECORD</span><h2>{form._originalId ? 'Edit student' : 'Add student'}</h2><p>All fields are required.</p></div><button className="dialog-close" type="button" aria-label="Close dialog" onClick={closeForm}>×</button></div>{apiError && <p className="notice error dialog-error" role="alert">{apiError}</p>}<StudentForm value={form} errors={errors} isEditing={Boolean(form._originalId)} busy={saving} onChange={updateField} onSubmit={save} onCancel={closeForm}/></dialog>}
  </main>;
}

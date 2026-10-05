import { useEffect, useMemo, useRef, useState } from 'react';
import { studentApi } from './api/students';
import { emptyStudent, validateStudent } from './validation/student';
import StudentForm from './components/StudentForm';

export default function App() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [major, setMajor] = useState('');
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const dialogRef = useRef(null);
  const rowRefs = useRef(new Map());

  const load = async () => {
    setLoading(true);
    setApiError('');
    try { setStudents(await studentApi.list()); }
    catch (error) { setApiError(error.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (form && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [form]);

  const majors = useMemo(() => [...new Set(students.map((student) => student.major))].sort(), [students]);
  const visibleStudents = useMemo(() => students.filter((student) =>
    (!major || student.major === major) &&
    Object.values(student).some((value) => value.toLowerCase().includes(query.toLowerCase()))
  ), [students, major, query]);

  useEffect(() => {
    if (!highlightId) return undefined;
    rowRefs.current.get(highlightId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timeout = window.setTimeout(() => setHighlightId(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [highlightId, visibleStudents]);

  const startForm = (student = null) => {
    setForm(student ? { ...student, _originalId: student.id } : emptyStudent());
    setErrors({});
    setNotice('');
    setApiError('');
  };
  const closeForm = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    setForm(null);
    setErrors({});
  };
  const updateField = (key, value) => {
    const next = { ...form, [key]: value };
    setForm(next);
    setErrors(validateStudent(next, students, form._originalId || null).fields);
  };

  const save = async (event) => {
    event.preventDefault();
    const originalId = form._originalId;
    const { student, fields } = validateStudent(form, students, originalId);
    setErrors(fields);
    if (Object.keys(fields).length) return;
    setSaving(true);
    setApiError('');
    try {
      const saved = originalId ? await studentApi.update(originalId, student) : await studentApi.create(student);
      setStudents((items) => originalId
        ? items.map((item) => item.id === originalId ? saved : item)
        : [...items, saved]);
      if (!originalId) {
        setQuery('');
        setMajor('');
        setHighlightId(saved.id);
      }
      closeForm();
      setNotice(originalId ? 'Student updated successfully.' : 'Student added successfully.');
    } catch (error) {
      setErrors(error.fields || {});
      setApiError(error.message);
    } finally { setSaving(false); }
  };

  const remove = async (student) => {
    if (!window.confirm(`Delete ${student.name}?`)) return;
    setApiError('');
    setNotice('');
    try {
      await studentApi.remove(student.id);
      setStudents((items) => items.filter((item) => item.id !== student.id));
      setNotice('Student deleted successfully.');
    } catch (error) { setApiError(error.message); }
  };

  return <main className="app-shell">
    <section className="workspace">
      <div className="page-heading">
        <div><span className="kicker">ACADEMIC RECORDS</span><h1>Students</h1></div>
        <div className="heading-actions"><span className="record-count">{students.length} records</span><button className="button button-primary" onClick={() => startForm()}>＋ Add student</button></div>
      </div>

      {notice && <p className="notice success" role="status">{notice}</p>}
      {apiError && <p className="notice error" role="alert">{apiError} <button onClick={load}>Retry</button></p>}

      <section className="panel">
        <div className="filters">
          <label>Search<input placeholder="Search name, ID, email, or major" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label>Major<select value={major} onChange={(event) => setMajor(event.target.value)}><option value="">All majors</option>{majors.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        {loading ? <p className="state">Loading student records…</p> : visibleStudents.length === 0
          ? <div className="state"><h2>No students found</h2><p>{students.length ? 'Try clearing your search or filter.' : 'Add a student to get started.'}</p></div>
          : <div className="table-wrap"><table><thead><tr><th>ID</th><th>Student</th><th>Email</th><th>Date of birth</th><th>Major</th><th aria-label="Actions" /></tr></thead>
            <tbody>{visibleStudents.map((student) => <tr key={student.id} data-student-id={student.id} className={highlightId === student.id ? 'student-row student-row-highlight' : 'student-row'} ref={(node) => node ? rowRefs.current.set(student.id, node) : rowRefs.current.delete(student.id)}>
              <td><code>{student.id}</code></td><td><strong>{student.name}</strong></td><td>{student.email}</td><td>{student.dob}</td><td><span className="tag">{student.major}</span></td>
              <td className="actions"><button onClick={() => startForm(student)}>Edit</button><button className="delete" onClick={() => remove(student)}>Delete</button></td>
            </tr>)}</tbody>
          </table></div>}
      </section>
    </section>

    {form && <dialog className="student-dialog" ref={dialogRef} onClose={() => { setForm(null); setErrors({}); }} onCancel={(event) => { event.preventDefault(); closeForm(); }}>
      <div className="dialog-heading"><div><span className="kicker">STUDENT RECORD</span><h2>{form._originalId ? 'Edit student' : 'Add student'}</h2><p>Enter the student details below.</p></div><button className="dialog-close" type="button" aria-label="Close dialog" onClick={closeForm}>×</button></div>
      {apiError && <p className="notice error" role="alert">{apiError}</p>}
      <StudentForm value={form} errors={errors} isEditing={Boolean(form._originalId)} busy={saving} onChange={updateField} onSubmit={save} onCancel={closeForm} />
    </dialog>}
  </main>;
}

const fields = [
  ['id', 'Student ID', 'text'], ['name', 'Full name', 'text'], ['email', 'Email address', 'email'], ['dob', 'Date of birth', 'date'], ['major', 'Major', 'text']
];
export default function StudentForm({ value, errors, isEditing, busy, onChange, onSubmit, onCancel }) {
  return <form className="student-form" onSubmit={onSubmit} noValidate>
    <div className="form-grid">{fields.map(([key, label, type]) => <label key={key} className="field">
      <span>{label}</span>
      <input type={type} value={value[key]} disabled={busy || (isEditing && key === 'id')} onChange={(event) => onChange(key, event.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined} />
      {errors[key] && <small id={`${key}-error`} role="alert">{errors[key]}</small>}
    </label>)}</div>
    <div className="form-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : isEditing ? 'Save changes' : 'Add student'}</button><button type="button" className="button button-quiet" onClick={onCancel} disabled={busy}>Cancel</button></div>
  </form>;
}

export const studentFields = ['id', 'name', 'email', 'dob', 'major'];
export const editableFields = ['name', 'email', 'dob', 'major'];

// DOB is compared against the UTC calendar date on both client and server.
export function utcToday(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function validateStudent(input, students = [], currentId = null, { partial = false } = {}) {
  const fields = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { student: {}, fields: { _form: 'Submit a student record as a JSON object.' } };
  }
  const allowed = partial ? editableFields : studentFields;
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) fields[key] = key === 'id' && partial ? 'Student ID cannot be changed.' : 'Unknown field.';
  }
  for (const key of allowed) {
    if (!(key in input)) continue;
    if (typeof input[key] !== 'string') fields[key] = 'Enter this value as text.';
  }
  const student = Object.fromEntries(studentFields.map((key) => [key, typeof input[key] === 'string' ? input[key].trim() : '']));
  student.email = student.email.toLowerCase();

  const required = partial ? Object.keys(input).filter((key) => editableFields.includes(key)) : studentFields;
  for (const key of required) {
    if (typeof input[key] === 'string' && !student[key]) fields[key] ||= `${key === 'dob' ? 'Date of birth' : key === 'id' ? 'Student ID' : key[0].toUpperCase() + key.slice(1)} is required.`;
  }
  if (!partial || 'id' in input) {
    if (student.id && !/^[A-Za-z0-9-]+$/.test(student.id)) fields.id ||= 'Use only ASCII letters, numbers, and hyphens.';
    if (student.id && students.some((item) => item.id === student.id && item.id !== currentId)) fields.id ||= 'This student ID already exists.';
  }
  if (!partial || 'name' in input) {
    if (student.name && student.name.length < 2) fields.name ||= 'Name must contain at least 2 characters.';
  }
  if (!partial || 'email' in input) {
    if (student.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) fields.email ||= 'Enter a valid email address.';
    if (student.email && students.some((item) => item.email.toLowerCase() === student.email && item.id !== currentId)) fields.email ||= 'This email is already registered.';
  }
  if (!partial || 'dob' in input) {
    if (student.dob && (!isDateOnly(student.dob) || student.dob > utcToday())) fields.dob ||= 'Use a real YYYY-MM-DD date no later than today (UTC).';
  }
  return { student, fields };
}

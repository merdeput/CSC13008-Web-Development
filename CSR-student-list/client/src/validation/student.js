const fields = ['id', 'name', 'email', 'dob', 'major'];
const blank = { id: '', name: '', email: '', dob: '', major: '' };
export const emptyStudent = () => ({ ...blank });

// DOB is checked against the UTC calendar date in both browser and server.
function utcToday() { return new Date().toISOString().slice(0, 10); }
function isDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function validateStudent(value, students = [], originalId = null) {
  const errors = {};
  const student = Object.fromEntries(fields.map((key) => [key, typeof value[key] === 'string' ? value[key].trim() : '']));
  student.email = student.email.toLowerCase();
  const checkedFields = originalId ? fields.filter((key) => key !== 'id') : fields;
  for (const key of checkedFields) {
    if (typeof value[key] !== 'string') errors[key] = 'Enter this value as text.';
    else if (!student[key]) errors[key] = `${key === 'dob' ? 'Date of birth' : key === 'id' ? 'Student ID' : key[0].toUpperCase() + key.slice(1)} is required.`;
  }
  if (!originalId && student.id && !/^[A-Za-z0-9-]+$/.test(student.id)) errors.id = 'Use only ASCII letters, numbers, and hyphens.';
  else if (!originalId && student.id && students.some((item) => item.id === student.id)) errors.id = 'This student ID already exists.';
  if (student.name && student.name.length < 2) errors.name = 'Name must contain at least 2 characters.';
  if (student.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) errors.email = 'Enter a valid email address.';
  else if (student.email && students.some((item) => item.email.toLowerCase() === student.email && item.id !== originalId)) errors.email = 'This email is already registered.';
  if (student.dob && (!isDateOnly(student.dob) || student.dob > utcToday())) errors.dob = 'Use a real YYYY-MM-DD date no later than today (UTC).';
  return { student, fields: errors };
}

export function validateStudentUpdate(value, students = [], originalId) {
  const { student, fields } = validateStudent({ ...value, id: originalId }, students, originalId);
  delete fields.id;
  return { student, fields };
}
